import { beforeEach, describe, expect, it, vi } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";
import { segmentUserIds, sendBroadcast } from "~~/lib/admin/broadcast";
import { processDeliveries } from "~~/lib/notifications/worker";

import { selectionCsv } from "./export";
import { PARTICIPATION_SUCCESS, participationSchema, QUESTIONS } from "./form";
import { inviteToParticipation, loadParticipation, materializeParticipationReminders, submitParticipation } from "./store";
import { saveConsentScan } from "./scan";

let seasonId: string;
beforeEach(async () => {
  await resetDatabase();
  seasonId = (await db.season.create({ data: { slug: "sha", title: "ША", year: 2026, isCurrent: true } })).id;
});

async function candidate(firstName: string, outcome?: "PASSED" | "RESERVE" | "REJECTED", opts: { blocked?: boolean } = {}) {
  const user = await db.user.create({ data: { status: opts.blocked ? "BLOCKED" : "ACTIVE", faculty: "ЮФ", telegramId: String(await db.user.count() + 100) } });
  const app = await db.application.create({ data: {
    seasonId, userId: user.id, status: "SUBMITTED", firstName,
    decisions: outcome ? { create: { stageKind: "INTERVIEW", outcome } } : undefined,
  } });
  return { id: app.id, userId: user.id, telegramId: user.telegramId! };
}

const invite = (id: string) => inviteToParticipation({ seasonId: id, title: "Приглашение", body: null, questions: { ...QUESTIONS, attending: "Будешь с нами?" } });

describe("Подтверждение участия в ША", () => {
  it("выбирает только отмеченных кнопкой «Проходит» и сохраняет снимок анкеты вместе с уведомлением", async () => {
    const accepted = await candidate("Анна", "PASSED");
    const reserve = await candidate("Мария", "RESERVE");
    await candidate("Олег", "REJECTED");
    await candidate("Павел");
    await candidate("Илья", "PASSED", { blocked: true });

    expect(await segmentUserIds(seasonId, "sha_test")).toEqual([accepted.userId]);
    expect(await sendBroadcast({ seasonId, segment: "sha_test", title: "Тест", body: null, url: "/cabinet" })).toBe(1);
    expect(await db.notification.findFirst({ where: { title: "Тест" } })).toMatchObject({ userId: accepted.userId, url: "/test" });
    expect(await loadParticipation(seasonId, accepted.userId)).toBeNull();
    expect(await invite(seasonId)).toBe(1);
    expect(await invite(seasonId)).toBe(0);
    expect(await loadParticipation(seasonId, accepted.userId)).toMatchObject({
      questions: { attending: "Будешь с нами?" }, submitted: false, name: "Анна", faculty: "ЮФ",
    });
    expect(await loadParticipation(seasonId, reserve.userId)).toBeNull();
    expect(await db.notification.findFirst({ where: { title: "Приглашение" }, include: { deliveries: true } }))
      .toMatchObject({ userId: accepted.userId, deliveries: [{ channel: "TELEGRAM" }] });
    const telegram = vi.fn(async () => {});
    await processDeliveries({ senders: { telegram, push: null }, now: new Date(Date.now() + 120_000), gapMs: 0 });
    expect(telegram).toHaveBeenCalledWith(accepted.telegramId, expect.objectContaining({
      title: "Приглашение", attachment: "parentConsent",
    }));
  });

  it("отправляет отказ сразу после согласия и отменяет созревшие напоминания после отправки", async () => {
    const accepted = await candidate("Анна", "PASSED");
    await invite(seasonId);
    await db.notificationDelivery.deleteMany();
    await db.participation.update({ where: { applicationId: accepted.id }, data: { invitedAt: new Date("2026-11-17T17:00:00Z") } });
    await db.notificationPreference.create({
      data: { userId: accepted.userId, channel: "TELEGRAM", category: "SYSTEM", enabled: false },
    });
    const nine = new Date("2026-11-18T06:00:00Z");
    expect(await materializeParticipationReminders(new Date("2026-11-18T05:59:59Z"))).toBe(0);
    expect(await materializeParticipationReminders(nine)).toBe(1);
    expect(await materializeParticipationReminders(nine)).toBe(0);
    expect(await db.notificationDelivery.count({ where: { channel: "TELEGRAM", status: "PENDING" } })).toBe(1);
    expect(participationSchema.safeParse({ consent: false, attending: false }).success).toBe(false);
    expect(await submitParticipation(seasonId, accepted.userId, { consent: true, attending: false })).toEqual({ ok: true, message: PARTICIPATION_SUCCESS });
    const results = await processDeliveries({ senders: { telegram: async () => { throw new Error("Лишнее напоминание"); }, push: null }, now: nine });
    expect(results).toMatchObject({ skipped: 1, retried: 0, sent: 0 });
    expect(await materializeParticipationReminders(new Date("2026-11-19T06:00:00Z"))).toBe(0);
    expect((await selectionCsv(seasonId, "participation")).text).toContain("Не сможет приехать");
  });

  it("проверяет формат паспорта и требует скан от несовершеннолетнего", async () => {
    const accepted = await candidate("Анна", "PASSED");
    await invite(seasonId);
    const answers = {
      consent: true, attending: true, passportName: "Анна Иванова", passportNumber: "4522 123456", passportDate: "01.01.2025",
      passportIssuer: "МВД России", citizenship: "Российская Федерация", studentId: "0012", diet: "Нет", conditions: "",
      medication: "", healthNotes: "", minor: true,
    } as const;
    expect(participationSchema.safeParse({ ...answers, passportDate: "31.02.2025" }).success).toBe(false);
    expect(participationSchema.safeParse({ ...answers, passportNumber: "4522123456" }).success).toBe(false);
    expect((await submitParticipation(seasonId, accepted.userId, participationSchema.parse(answers))).ok).toBe(false);
    await saveConsentScan(accepted.telegramId, Buffer.from("%PDF-1.4\n"));
    expect((await submitParticipation(seasonId, accepted.userId, participationSchema.parse(answers))).ok).toBe(true);
    const csv = await selectionCsv(seasonId, "participation");
    expect(csv.text).toContain("4522 123456");
    expect(csv.text).toContain("Анна Иванова");
  });

  it("включает в CSV прошедших оба очных этапа независимо от итогового решения", async () => {
    const rejected = await candidate("Есть оценка", "REJECTED");
    const bookedOnly = await candidate("Только запись");
    const absent = await candidate("Без ЦО");
    const master = await db.user.create({ data: { firstName: "Мастер" } });
    const session = await db.assessmentSession.create({ data: { seasonId, title: "ЦО", startsAt: new Date() } });
    await db.assessmentInvite.createMany({ data: [rejected, bookedOnly].map(({ id }) => ({ applicationId: id, sessionId: session.id, attended: true })) });
    const criterion = await db.criterion.create({ data: { seasonId, stageKind: "INTERVIEW", order: 1, title: "Вопрос", maxScore: 5, levels: [] } });
    for (const { id } of [rejected, absent]) {
      await db.review.create({ data: { applicationId: id, stageKind: "INTERVIEW", reviewerId: master.id, scores: { create: { criterionId: criterion.id, score: 3 } } } });
    }
    const slot = await db.interviewSlot.create({ data: { seasonId, startsAt: new Date("2026-11-03"), endsAt: new Date("2026-11-03"), location: "Корпус" } });
    await db.interviewBooking.create({ data: { applicationId: bookedOnly.id, slotId: slot.id } });
    const question = await db.formQuestion.create({ data: { seasonId, stageKind: "APPLICATION", order: 1, type: "SHORT_TEXT", section: "Профиль", label: "Учебная группа" } });
    await db.answer.create({ data: { applicationId: rejected.id, questionId: question.id, value: "Ю26-3В" } });
    const csv = await selectionCsv(seasonId, "completed");
    expect(csv.count).toBe(1);
    expect(csv.text).toContain("Есть оценка");
    expect(csv.text).toContain("Собеседование — балл");
    expect(csv.text).toContain(";3;5;3;Не берём;Да;Ю26-3В;");
  });
});
