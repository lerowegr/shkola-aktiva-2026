import { writeAudit } from "~~/lib/audit";
import { loadUser } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";
import { notify } from "~~/lib/notifications/notify";
import { can } from "~~/lib/permissions";
import { validateInterviewer, InterviewScheduleError } from "./scheduling";
import { ASSESSMENT_REQUIRED, hasAssessmentAttendance } from "./eligibility";
import { syncReviews } from "./booking";
import { BOOKING_LOCK, interviewPlace } from "./rules";

type Meta = { ip?: string | null; userAgent?: string | null };

export async function updateRoom(actorId: string, seasonId: string, slotId: string, room: string | null, meta: Meta = {}) {
  const actor = await loadUser(actorId);
  if (!actor || actor.status !== "ACTIVE" || (!can(actor, "interviews.manage") && !can(actor, "applications.review"))) return { ok: false, message: "Недостаточно прав для изменения аудитории." };
  const value = room?.trim() || null;
  if (value && value.length > 100) return { ok: false, message: "Аудитория — не длиннее 100 символов." };
  const result = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK})`);
    const slot = await tx.interviewSlot.findFirst({ where: { id: slotId, seasonId }, select: {
      id: true, room: true, location: true, startsAt: true,
      interviewers: { select: { userId: true } },
      bookings: { where: { cancelledAt: null }, select: { application: { select: { userId: true } } } },
    } });
    if (!slot) return { ok: false as const, message: "Слот не найден." };
    if (!can(actor, "interviews.manage") && !slot.interviewers.some(i => i.userId === actorId)) return { ok: false as const, message: "Можно указать аудиторию только своего собеседования." };
    if (slot.room === value) return { ok: true as const, slot, changed: false };
    await tx.interviewSlot.update({ where: { id: slotId }, data: { room: value } });
    await writeAudit({ actorId, action: "interview.room_update", entityType: "slot", entityId: slotId, meta: { before: slot.room, after: value }, ...meta }, tx);
    return { ok: true as const, slot: { ...slot, room: value }, changed: true };
  });
  if (!result.ok) return result;
  if (result.changed) await notify(result.slot.bookings.map(b => ({
    userId: b.application.userId, category: "SELECTION" as const,
    title: "Уточнена аудитория собеседования",
    body: `${when(result.slot.startsAt)}. ${interviewPlace(result.slot)}.`, url: "/cabinet/interview",
  })), { urgent: true });
  return { ok: true, message: result.changed ? "Аудитория сохранена. Участники уведомлены." : "Аудитория не изменилась." };
}

function when(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(date);
}

/** Ручное исключение: только организатор; лимит кандидата меняется явно. */
export async function manageBooking(params: { actorId: string; seasonId: string; applicationId: string; slotId: string | null; restoreChange: boolean }, meta: Meta = {}, now = new Date()) {
  const actor = await loadUser(params.actorId);
  if (!actor || actor.status !== "ACTIVE" || !can(actor, "interviews.manage")) return { ok: false, message: "Недостаточно прав для переноса записи." };
  if (!params.slotId && params.restoreChange) return { ok: false, message: "Для восстановления перезаписи выберите новое время." };
  const result = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK})`);
    const application = await tx.application.findFirst({ where: { id: params.applicationId, seasonId: params.seasonId, status: "SUBMITTED" }, select: { userId: true, interviewReschedulesUsed: true } });
    if (!application) return { ok: false as const, message: "Отправленная анкета не найдена." };
    if (params.slotId && !await hasAssessmentAttendance(tx, params.applicationId)) return { ok: false as const, message: ASSESSMENT_REQUIRED };
    const current = await tx.interviewBooking.findFirst({ where: { applicationId: params.applicationId, cancelledAt: null }, select: { id: true, slotId: true } });
    const slot = params.slotId ? await tx.interviewSlot.findFirst({ where: { id: params.slotId, seasonId: params.seasonId }, select: { id: true, startsAt: true, location: true, room: true, capacity: true, interviewers: { select: { userId: true } }, _count: { select: { bookings: { where: { cancelledAt: null } } } } } }) : null;
    if (params.slotId && (!slot || slot.startsAt <= now || slot.capacity !== 1 || slot.interviewers.length !== 1)) return { ok: false as const, message: "Выберите будущий слот с одним мастером и одним местом." };
    if (slot) {
      try { await validateInterviewer(tx, slot.interviewers[0]!.userId); }
      catch (error) { if (error instanceof InterviewScheduleError) return { ok: false as const, message: error.message }; throw error; }
    }
    const same = Boolean(slot && current?.slotId === slot.id);
    if (slot && !same && slot._count.bookings >= 1) return { ok: false as const, message: "Это время занято — выберите другое." };
    if (!current && !slot) return { ok: false as const, message: "Активной записи нет. Для восстановления права выберите новое время." };
    if (!same) {
      if (current) await tx.interviewBooking.update({ where: { id: current.id }, data: { cancelledAt: now } });
      if (slot) await tx.interviewBooking.create({ data: { applicationId: params.applicationId, slotId: slot.id, createdAt: now } });
      await syncReviews(tx, params.applicationId, slot?.interviewers.map(i => i.userId) ?? []);
    }
    const changed = !same || (params.restoreChange && application.interviewReschedulesUsed !== 0);
    if (params.restoreChange && changed) await tx.application.update({ where: { id: params.applicationId }, data: { interviewReschedulesUsed: 0 } });
    if (changed) await writeAudit({ actorId: params.actorId, action: "interview.booking_manage", entityType: "application", entityId: params.applicationId, meta: { fromSlotId: current?.slotId ?? null, toSlotId: slot?.id ?? null, restoreChange: params.restoreChange, changesBefore: application.interviewReschedulesUsed }, ...meta }, tx);
    return { ok: true as const, userId: application.userId, slot, changed };
  });
  if (!result.ok) return result;
  if (result.changed) await notify([{
    userId: result.userId, category: "SELECTION", title: result.slot ? "Организатор изменил запись на собеседование" : "Запись на собеседование отменена организатором",
    body: result.slot ? `${when(result.slot.startsAt)}, ${interviewPlace(result.slot)}.${params.restoreChange ? " Право на одну самостоятельную перезапись восстановлено." : ""}` : "Для выбора нового времени свяжитесь с организаторами.", url: "/cabinet/interview",
  }, ...(result.slot?.interviewers.map(i => ({ userId: i.userId, category: "REVIEW" as const, title: "Организатор изменил запись на собеседование", body: when(result.slot!.startsAt), url: `/staff/applications/${params.applicationId}?stage=INTERVIEW` })) ?? [])], { urgent: true });
  return { ok: true, message: "Запись обновлена. Изменение сохранено в журнале." };
}
