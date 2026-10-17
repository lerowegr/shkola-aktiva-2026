import { placeLine, readPlace } from "~~/lib/assessment/rules";
import { db } from "~~/lib/db";
import { stageState } from "~~/lib/stages";

import { notify, type NotifyInput } from "./notify";

const DAY = 24 * 60 * 60 * 1000;
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow",
});

function withinDay(date: Date, now: Date) {
  const left = date.getTime() - now.getTime();
  return left > 0 && left <= DAY;
}

/** Раз в минуту досоздаём напоминания; ключ с датой допускает перенос дедлайна. */
export async function materializeApplicationDeadline(now = new Date()): Promise<number> {
  const stage = await db.stage.findFirst({
    where: { kind: "APPLICATION", season: { isCurrent: true } },
    select: { id: true, seasonId: true, mode: true, opensAt: true, closesAt: true },
  });
  if (!stage?.closesAt || stageState(stage, now) !== "open" || !withinDay(stage.closesAt, now)) return 0;

  const key = `application-deadline:${stage.id}:${stage.closesAt.toISOString()}:24h`;
  const deadline = dateFormat.format(stage.closesAt);
  const users = await db.user.findMany({
    where: {
      status: "ACTIVE", isOwner: false, roles: { none: {} },
      applications: { none: { seasonId: stage.seasonId, status: "SUBMITTED" } },
      notifications: { none: { key } },
    },
    select: { id: true },
  });
  return notify(users.map((user) => ({
    userId: user.id, category: "SELECTION",
    title: "Не забудь отправить анкету и домашнее задание",
    body: `До дедлайна осталось не больше суток. Дозаполни анкету, добавь домашнее задание и отправь всё до ${deadline} по Москве. Сохранённый черновик ещё не считается отправленной анкетой.`,
    url: "/cabinet/application", key,
  })), { now });
}

/** Только опубликованный снимок ЦО: правка без рассылки кандидату не видна. */
export async function materializeAssessmentReminders(now = new Date()): Promise<number> {
  const groups = await db.assessmentGroup.findMany({
    where: { season: { isCurrent: true }, notifiedAt: { not: null } },
    select: {
      id: true, notified: true,
      members: {
        where: { application: { status: "SUBMITTED", user: { status: "ACTIVE" } } },
        select: { application: { select: { userId: true } } },
      },
    },
  });
  const inputs: NotifyInput[] = [];
  for (const group of groups) {
    const place = readPlace(group.notified);
    if (!place?.startsAt) continue;
    const startsAt = new Date(place.startsAt);
    if (!withinDay(startsAt, now)) continue;
    const body = [
      `Центр оценки — ${dateFormat.format(startsAt)} по Москве.`,
      placeLine(place), place.note,
    ].filter(Boolean).join(" ");
    for (const member of group.members) {
      inputs.push({
        userId: member.application.userId, category: "SELECTION",
        title: "Напоминание о центре оценки", body, url: "/cabinet",
        key: `assessment:${group.id}:${startsAt.toISOString()}:24h`,
      });
    }
  }
  return notify(inputs, { now });
}
