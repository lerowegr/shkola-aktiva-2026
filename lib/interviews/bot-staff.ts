import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { db } from "~~/lib/db";
import { loadUser, displayName, type CurrentUser } from "~~/lib/auth/actor";
import { can } from "~~/lib/permissions";
import { fullName } from "~~/lib/applications/staff";
import { writeAudit } from "~~/lib/audit";
import { notify, type NotifyInput } from "~~/lib/notifications/notify";
import { BOOKING_LOCK, interviewPlace } from "./rules";
import { checkOverlap, validateInterviewer, InterviewScheduleError } from "./scheduling";
import { botWhen, validBotDay } from "./bot-rules";

const draftSchema = z.object({ kind: z.enum(["message", "room", "time", "location", "day"]), slotId: z.string().optional(), version: z.string().optional(), token: z.string(), expiresAt: z.string().datetime(), value: z.string().optional() });
export type InterviewBotDraft = z.infer<typeof draftSchema>;
const draftId = (actorId: string) => `bot-interview:${actorId}`;
const include = { interviewers: { include: { user: { select: { id: true, firstName: true, lastName: true, telegramUsername: true, email: true } } } }, bookings: { where: { cancelledAt: null }, include: { application: { select: { id: true, userId: true, firstName: true, lastName: true, middleName: true, user: { select: { telegramId: true, status: true } } } } }, orderBy: { id: "asc" as const } } };
type BotSlot = NonNullable<Awaited<ReturnType<typeof loadBotSlot>>>;
export function botSlotVersion(slot: object): string { return createHash("sha256").update(JSON.stringify(slot)).digest("hex"); }
export async function interviewBotActor(telegramId: string) {
  const user = await db.user.findUnique({ where: { telegramId }, select: { id: true } });
  const actor = await loadUser(user?.id);
  return actor?.status === "ACTIVE" && (can(actor, "interviews.manage") || can(actor, "applications.review")) ? actor : null;
}
export const botCanManageAll = (actor: CurrentUser) => actor.status === "ACTIVE" && can(actor, "interviews.manage");
function scope(actor: CurrentUser) { return botCanManageAll(actor) ? {} : { interviewers: { some: { userId: actor.id } } }; }
export async function loadBotSlot(telegramId: string, slotId: string) {
  const actor = await interviewBotActor(telegramId);
  if (!actor) return null;
  return db.interviewSlot.findFirst({ where: { id: slotId, archivedAt: null, season: { isCurrent: true }, ...scope(actor) }, include });
}
export async function listBotSlots(telegramId: string, day: string, page = 0) {
  const actor = await interviewBotActor(telegramId);
  if (!actor || !validBotDay(day) || !Number.isInteger(page) || page < 0 || page > 1000) return null;
  const start = new Date(`${day}T00:00:00+03:00`);
  const where = { archivedAt: null, season: { isCurrent: true }, startsAt: { gte: start, lt: new Date(+start + 86400_000) }, ...scope(actor) };
  const [total, slots] = await Promise.all([db.interviewSlot.count({ where }), db.interviewSlot.findMany({ where, include, orderBy: [{ startsAt: "asc" }, { id: "asc" }], skip: page * 8, take: 8 })]);
  return { actor, total, slots };
}
export async function botConversation(telegramId: string, slotId: string) {
  const actor = await interviewBotActor(telegramId), slot = await loadBotSlot(telegramId, slotId);
  if (!actor || !slot || !can(actor, "messages.reply")) return null;
  const candidate = slot.bookings[0]?.application;
  if (!candidate) return [];
  const thread = await db.messageThread.findUnique({ where: { seasonId_candidateId: { seasonId: slot.seasonId, candidateId: candidate.userId } }, select: { messages: { where: { author: { not: "BOT" } }, orderBy: { createdAt: "desc" }, take: 5, select: { author: true, text: true, createdAt: true } } } });
  return thread?.messages.reverse() ?? [];
}
export async function clearBotDraft(telegramId: string) {
  const actor = await interviewBotActor(telegramId);
  if (actor) await db.settings.deleteMany({ where: { id: draftId(actor.id) } });
}
export async function getBotDraft(telegramId: string, now = new Date()) {
  const actor = await interviewBotActor(telegramId);
  if (!actor) return null;
  const parsed = draftSchema.safeParse((await db.settings.findUnique({ where: { id: draftId(actor.id) } }))?.data);
  return parsed.success && new Date(parsed.data.expiresAt) > now ? parsed.data : null;
}
export async function beginBotDraft(telegramId: string, kind: InterviewBotDraft["kind"], slotId?: string, now = new Date()) {
  const actor = await interviewBotActor(telegramId);
  if (!actor) return null;
  const slot = slotId ? await loadBotSlot(telegramId, slotId) : null;
  if (kind === "day" ? !botCanManageAll(actor) : !slot) return null;
  if (kind === "message" && (!can(actor, "messages.reply") || !slot?.bookings.length || !slot.bookings[0]?.application.user.telegramId)) return null;
  const data: InterviewBotDraft = { kind, ...(slot ? { slotId: slot.id, version: botSlotVersion(slot) } : {}), token: randomBytes(6).toString("hex"), expiresAt: new Date(+now + 15 * 60_000).toISOString() };
  await db.settings.upsert({ where: { id: draftId(actor.id) }, create: { id: draftId(actor.id), data }, update: { data } });
  return data;
}
export async function fillBotDraft(telegramId: string, value: string, now = new Date()) {
  const actor = await interviewBotActor(telegramId), draft = await getBotDraft(telegramId, now);
  if (!actor || !draft) return null;
  // Условная запись не возвращает старый черновик поверх другого открытого действия.
  const data = { ...draft, value, token: randomBytes(6).toString("hex") };
  const changed = await db.settings.updateMany({ where: { id: draftId(actor.id), data: { path: ["token"], equals: draft.token } }, data: { data } });
  return changed.count ? data : null;
}

/** Все изменения бота проходят здесь: повторная авторизация, версия, замок и аудит. */
export async function confirmBotDraft(telegramId: string, token: string, now = new Date()) {
  const actor = await interviewBotActor(telegramId);
  if (!actor) return { ok: false, message: "Доступ закрыт или нет права работать с собеседованиями." };
  try {
    const result = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK})`);
      const parsed = draftSchema.safeParse((await tx.settings.findUnique({ where: { id: draftId(actor.id) } }))?.data);
      if (!parsed.success || parsed.data.token !== token || new Date(parsed.data.expiresAt) <= now || !parsed.data.value || parsed.data.kind === "day") return { ok: false as const, message: "Подтверждение устарело. Откройте карточку и начните заново." };
      const draft = parsed.data, value = draft.value!.trim();
      const slot = await tx.interviewSlot.findFirst({ where: { id: draft.slotId, archivedAt: null, season: { isCurrent: true }, ...scope(actor) }, include });
      if (!slot || botSlotVersion(slot) !== draft.version) return { ok: false as const, message: "Собеседование или участник изменились. Откройте карточку заново." };
      const notices: NotifyInput[] = [];
      if (draft.kind === "message") {
        if (!can(actor, "messages.reply")) return { ok: false as const, message: "Нет права писать участникам." };
        const candidate = slot.bookings[0]?.application;
        if (!candidate || candidate.user.status !== "ACTIVE" || !candidate.user.telegramId || !value || value.length > 3500) return { ok: false as const, message: "Нет доступного участника или сообщение длиннее 3500 символов." };
        const thread = await tx.messageThread.upsert({ where: { seasonId_candidateId: { seasonId: slot.seasonId, candidateId: candidate.userId } }, create: { seasonId: slot.seasonId, candidateId: candidate.userId }, update: { lastMessageAt: now, staffReadAt: now } });
        const message = await tx.message.create({ data: { threadId: thread.id, author: "STAFF", authorId: actor.id, via: "TELEGRAM", text: value, createdAt: now } });
        await tx.messageThread.update({ where: { id: thread.id }, data: { lastMessageAt: now, staffReadAt: now } });
        await writeAudit({ actorId: actor.id, action: "message.reply", entityType: "application", entityId: candidate.id, meta: { via: "TELEGRAM", slotId: slot.id, messageId: message.id } }, tx);
        notices.push({ userId: candidate.userId, category: "MESSAGES", title: "Сообщение от Школы Актива", body: value, url: "/cabinet/messages", key: `bot-interview-message:${message.id}` });
      } else {
        if (slot.capacity !== 1 || slot.interviewers.length !== 1) return { ok: false as const, message: "Изменять можно только слот с одним мастером и одним местом." };
        if (slot.startsAt <= now) return { ok: false as const, message: "Встреча уже началась. Её время и место не меняются; можно написать участнику." };
        const data: { startsAt?: Date; endsAt?: Date; room?: string | null; location?: string } = {};
        if (draft.kind === "time") {
          const start = new Date(value);
          if (!Number.isFinite(+start) || start <= now) return { ok: false as const, message: "Выберите будущее время по Москве." };
          data.startsAt = start; data.endsAt = new Date(+start + 45 * 60_000);
          for (const i of slot.interviewers) {
            await validateInterviewer(tx, i.userId);
            await checkOverlap(tx, i.userId, start, data.endsAt, slot.id);
          }
        } else if (draft.kind === "room") {
          if (value.length > 100) return { ok: false as const, message: "Аудитория — не длиннее 100 символов." };
          data.room = value === "-" ? null : value;
        } else {
          if (!value || value.length > 300) return { ok: false as const, message: "Корпус — от 1 до 300 символов." };
          data.location = value;
        }
        if ((data.startsAt && +data.startsAt === +slot.startsAt) || (draft.kind === "room" && data.room === slot.room) || data.location === slot.location) return { ok: false as const, message: "Значение не изменилось." };
        await tx.interviewSlot.update({ where: { id: slot.id }, data });
        // Новые booking id делают старые напоминания неактуальными, попытку не расходуем.
        if (draft.kind === "time" && slot.bookings.length) {
          await tx.interviewBooking.updateMany({ where: { id: { in: slot.bookings.map(b => b.id) } }, data: { cancelledAt: now } });
          await tx.interviewBooking.createMany({ data: slot.bookings.map(b => ({ applicationId: b.applicationId, slotId: slot.id, createdAt: now })) });
        }
        await writeAudit({ actorId: actor.id, action: "interview.bot_update", entityType: "slot", entityId: slot.id, meta: { via: "TELEGRAM", kind: draft.kind, before: { startsAt: slot.startsAt, endsAt: slot.endsAt, location: slot.location, room: slot.room }, after: data, applicationIds: slot.bookings.map(b => b.applicationId), participants: slot.bookings.map(b => fullName(b.application)), masters: slot.interviewers.map(i => displayName(i.user)) } }, tx);
        const next = { ...slot, ...data };
        const body = `Было: ${botWhen(slot.startsAt)}, ${interviewPlace(slot)}.\nТеперь: ${botWhen(next.startsAt)}–${new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" }).format(next.endsAt)}, ${interviewPlace(next)}. Время московское. Лимит самостоятельной перезаписи не изменился.`;
        for (const b of slot.bookings) notices.push({ userId: b.application.userId, category: "SELECTION", title: "Организатор изменил собеседование", body, url: "/cabinet/interview", key: `bot-interview-update:${draft.token}:${b.id}` });
        for (const i of slot.interviewers) notices.push({ userId: i.userId, category: "SYSTEM", title: "Изменено собеседование", body: `${slot.bookings.map(b => fullName(b.application)).join(", ") || "Свободный слот"}\n${body}`, url: `/staff/interviews?botSlot=${slot.id}`, key: `bot-interview-update:${draft.token}:${slot.id}` });
      }
      await tx.settings.deleteMany({ where: { id: draftId(actor.id), data: { path: ["token"], equals: token } } });
      return { ok: true as const, slotId: slot.id, notices, message: draft.kind === "message" ? "Сообщение сохранено. Доставка участнику поставлена в очередь Telegram." : "Изменение сохранено в журнале. Уведомления поставлены в очередь." };
    });
    if (result.ok) await notify(result.notices, { urgent: true, now, deliverAt: now });
    return result;
  } catch (error) {
    if (error instanceof InterviewScheduleError) return { ok: false, message: error.message };
    throw error;
  }
}
export function botSlotTitle(slot: BotSlot) {
  return `${botWhen(slot.startsAt)}–${new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" }).format(slot.endsAt)} МСК\n${interviewPlace(slot)}\nМастер: ${slot.interviewers.map(i => displayName(i.user)).join(", ")}\n${slot.bookings.map(b => fullName(b.application)).join(", ") || "Свободно"}`;
}
