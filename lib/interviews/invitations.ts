import { db } from "~~/lib/db";
import { loadUser } from "~~/lib/auth/actor";
import { writeAudit } from "~~/lib/audit";
import { can } from "~~/lib/permissions";
import { notify } from "~~/lib/notifications/notify";
import { stageState } from "~~/lib/stages";
import { canBook } from "./rules";

const keyFor = (seasonId: string) => `interview-invite:${seasonId}`;
export function interviewInvitationText(opensAt: Date | null, state: "open" | "upcoming" | "closed"): string {
  const opening = opensAt ? new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(opensAt) : null;
  const timing = state === "open" ? "" : state === "upcoming" && opening ? `\n\nЗапись откроется ${opening} по Москве.` : "\n\nЗапись сейчас закрыта. О доступном времени сообщат организаторы.";
  return `Привет!\n\nОстался последний этап отбора — собеседование.${timing}\n\nОтправь этому боту !собес и выбери удобный корпус, день и время кнопками. Можно записаться и в личном кабинете.\nОграничений по факультетам нет — приходи туда, где тебе удобно.\n\nУчти: перезаписаться (поменять время) можно только один раз и не позднее 18:00 по Москве накануне собеседования.\n\nЗаписаться на 02.11 (понедельник) возможно до 02:00 ночи 2 ноября по Москве. На другие дни запись заканчивается в 20:00 по Москве за день до собеседования.\n\nТочное место проведения собеседования (аудитория и подробности) тебе отпишут в личные сообщения за 5 минут до встречи!\n\nЖдём твою запись!`;
}

async function invitationContext(seasonId: string, now: Date) {
  const stage = await db.stage.findUnique({ where: { seasonId_kind: { seasonId, kind: "INTERVIEW" } }, select: { id: true, mode: true, opensAt: true, closesAt: true } });
  if (!stage) return null;
  const people = await db.application.findMany({ where: {
    seasonId, status: "SUBMITTED", assessmentInvite: { is: { attended: true } }, bookings: { none: { cancelledAt: null } }, decisions: { none: { stageKind: "INTERVIEW", publishedAt: { not: null } } },
    user: { status: "ACTIVE", isOwner: false, roles: { none: {} }, notifications: { none: { key: keyFor(seasonId) } } },
  }, select: { userId: true } });
  const slots = await db.interviewSlot.findMany({ where: { seasonId, archivedAt: null, capacity: 1, startsAt: { gt: now } }, select: { startsAt: true, interviewers: { select: { userId: true } }, _count: { select: { bookings: { where: { cancelledAt: null } } } } } });
  const availableSlots = slots.filter(s => canBook(s.startsAt, now) && s.interviewers.length === 1 && s._count.bookings === 0).length;
  const state = stageState(stage, now);
  return { stage, state, people, availableSlots, text: interviewInvitationText(stage.opensAt, state) };
}

export async function previewInvitations(seasonId: string, now = new Date()) {
  const ctx = await invitationContext(seasonId, now);
  if (!ctx) return null;
  return { count: ctx.people.length, availableSlots: ctx.availableSlots, state: ctx.state, opensAt: ctx.stage.opensAt, text: ctx.text };
}

export async function sendInvitations(seasonId: string, actorId: string, now = new Date()) {
  const actor = await loadUser(actorId);
  if (!actor || actor.status !== "ACTIVE" || !can(actor, "interviews.manage")) return { ok: false, message: "Нет права приглашать на собеседования." };
  const ctx = await invitationContext(seasonId, now);
  if (!ctx) return { ok: false, message: "Этап собеседования не создан." };
  await writeAudit({ actorId, action: "interview.invites_send", entityType: "stage", entityId: ctx.stage.id, meta: { requestedCount: ctx.people.length, state: ctx.state } });
  const count = await notify(ctx.people.map(p => ({ userId: p.userId, category: "SELECTION" as const, title: "Приглашение на собеседование в Школу Актива", body: ctx.text, url: "/cabinet/interview", key: keyFor(seasonId) })), { now, urgent: true });
  return { ok: true, message: `Создано приглашений: ${count}.`, count };
}

export async function interviewInviteIsCurrent(key: string | null, userId: string, _now: Date): Promise<boolean> {
  const match = key?.match(/^interview-invite:(.+)$/);
  if (!match) return true;
  const app = await db.application.findFirst({ where: { seasonId: match[1]!, userId, status: "SUBMITTED", assessmentInvite: { is: { attended: true } }, bookings: { none: { cancelledAt: null } }, decisions: { none: { stageKind: "INTERVIEW", publishedAt: { not: null } } } }, select: { id: true } });
  return Boolean(app);
}
