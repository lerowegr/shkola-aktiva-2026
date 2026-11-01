import { createHash, randomUUID } from "node:crypto";
import { db } from "~~/lib/db";
import { can } from "~~/lib/permissions";
import { loadUser } from "~~/lib/auth/actor";
import { writeAudit } from "~~/lib/audit";
import { notify } from "~~/lib/notifications/notify";
import { fullName } from "~~/lib/applications/staff";
import { availabilitySlots, matchBookings } from "./availability";
import type { InterviewInterval } from "./import-table";
import { BOOKING_LOCK, INTERVIEW_BREAK_MS, interviewPlace } from "./rules";
import { InterviewScheduleError, validateInterviewer } from "./scheduling";

const dayKey = (date: Date) => new Date(+date + 3 * 60 * 60_000).toISOString().slice(0, 10);
const groupKey = (master: string, date: string, place: string) => JSON.stringify([master, date, place]);
const when = (date: Date) => new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(date);

export async function reflowSchedule(params: { seasonId: string; actorId: string; rows: InterviewInterval[]; preview: boolean; version?: string }, now = new Date()) {
  const actor = await loadUser(params.actorId);
  if (!actor || actor.status !== "ACTIVE" || !can(actor, "interviews.manage")) return { ok: false, message: "Нет права изменять расписание." };
  try {
    if (!params.rows.length || params.rows.length > 500) throw new InterviewScheduleError("Вставьте от 1 до 500 интервалов.");
    let wanted;
    try { wanted = availabilitySlots(params.rows); } catch (error) { throw new InterviewScheduleError((error as Error).message); }
    if (!wanted.length || wanted.length > 2000 || wanted.some(s => s.startsAt <= now)) throw new InterviewScheduleError("Проверьте будущие интервалы: слотов нет, их слишком много или время уже прошло.");
    const outcome = await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK})`);
      const masters = [...new Set(wanted.map(s => s.interviewerId))];
      for (const master of masters) await validateInterviewer(tx, master);
      const scope = new Set(params.rows.map(r => `${r.interviewerId}:${r.date}`));
      const existing = (await tx.interviewSlot.findMany({
        where: { seasonId: params.seasonId, archivedAt: null, interviewers: { some: { userId: { in: masters } } } },
        orderBy: [{ startsAt: "asc" }, { id: "asc" }],
        include: { interviewers: true, bookings: { where: { cancelledAt: null }, orderBy: { id: "asc" }, include: { application: { select: { id: true, userId: true, firstName: true, lastName: true, middleName: true } } } } },
      })).filter(s => s.interviewers.some(i => scope.has(`${i.userId}:${dayKey(s.startsAt)}`)));
      if (existing.some(s => s.startsAt <= now || s.capacity !== 1 || s.interviewers.length !== 1 || s.bookings.length > 1)) throw new InterviewScheduleError("В выбранные дни есть прошедшие слоты или слоты старого формата. Исправьте их отдельно.");
      const version = createHash("sha256").update(JSON.stringify({ wanted, existing })).digest("hex");
      if (!params.preview && params.version !== version) throw new InterviewScheduleError("После предпросмотра появились записи или изменилось расписание. Проверьте таблицу ещё раз.");
      const used = new Set<string>();
      const target = wanted.map(s => {
        const old = existing.find(o => !used.has(o.id) && o.interviewers[0]!.userId === s.interviewerId && o.location === s.location && +o.startsAt === +s.startsAt && +o.endsAt === +s.endsAt);
        if (old) used.add(old.id);
        return { ...s, id: old?.id ?? randomUUID(), room: old?.room ?? null, create: !old };
      });
      const ids = existing.map(s => s.id);
      const outside = await tx.slotInterviewer.findMany({ where: { userId: { in: masters }, slot: { id: { notIn: ids }, archivedAt: null, startsAt: { lt: new Date(Math.max(...wanted.map(s => +s.endsAt)) + INTERVIEW_BREAK_MS) }, endsAt: { gt: new Date(Math.min(...wanted.map(s => +s.startsAt)) - INTERVIEW_BREAK_MS) } } }, select: { userId: true, slot: { select: { startsAt: true, endsAt: true } } } });
      if (target.some(t => outside.some(o => o.userId === t.interviewerId && +o.slot.startsAt < +t.endsAt + INTERVIEW_BREAK_MS && +o.slot.endsAt + INTERVIEW_BREAK_MS > +t.startsAt))) throw new InterviewScheduleError("Пересчёт пересекается с другим собеседованием мастера или нарушает перерыв 5 минут.");
      const moves: { bookingId: string; applicationId: string; userId: string; name: string; fromId: string; from: Date; to: typeof target[number] }[] = [];
      const groups = new Map<string, typeof existing>();
      for (const old of existing.filter(s => s.bookings.length)) {
        const key = groupKey(old.interviewers[0]!.userId, dayKey(old.startsAt), old.location);
        const items = groups.get(key) ?? []; items.push(old); groups.set(key, items);
      }
      for (const [key, old] of groups) {
        const options = target.filter(t => groupKey(t.interviewerId, t.date, t.location) === key);
        const matched = matchBookings(old.map(s => +s.startsAt), options.map(s => +s.startsAt));
        if (!matched) throw new InterviewScheduleError(`В корпусе «${old[0]!.location}» на ${dayKey(old[0]!.startsAt)} недостаточно новых слотов для уже записанных. Ничего не изменено.`);
        old.forEach((s, index) => {
          const to = options[matched[index]!]!, booking = s.bookings[0]!;
          if (s.id !== to.id) moves.push({ bookingId: booking.id, applicationId: booking.applicationId, userId: booking.application.userId, name: fullName(booking.application), fromId: s.id, from: s.startsAt, to });
        });
      }
      const removed = existing.filter(s => !used.has(s.id));
      const created = target.filter(t => t.create);
      const counts = { total: target.length, created: created.length, archived: removed.length, moved: moves.length, maxShiftMinutes: Math.max(0, ...moves.map(m => Math.abs(+m.from - +m.to.startsAt) / 60_000)) };
      if (!params.preview) {
        if (moves.length) await tx.interviewBooking.updateMany({ where: { id: { in: moves.map(m => m.bookingId) } }, data: { cancelledAt: now } });
        if (removed.length) await tx.interviewSlot.updateMany({ where: { id: { in: removed.map(s => s.id) } }, data: { archivedAt: now } });
        if (created.length) {
          await tx.interviewSlot.createMany({ data: created.map(s => ({ id: s.id, seasonId: params.seasonId, startsAt: s.startsAt, endsAt: s.endsAt, location: s.location, capacity: 1, createdById: params.actorId })) });
          await tx.slotInterviewer.createMany({ data: created.map(s => ({ slotId: s.id, userId: s.interviewerId })) });
        }
        if (moves.length) await tx.interviewBooking.createMany({ data: moves.map(m => ({ applicationId: m.applicationId, slotId: m.to.id, createdAt: now })) });
        await writeAudit({ actorId: params.actorId, action: "interview.schedule_reflow", entityType: "season", entityId: params.seasonId, meta: { ...counts, version, archivedSlotIds: removed.map(s => s.id), moves: moves.map(m => ({ bookingId: m.bookingId, applicationId: m.applicationId, fromSlotId: m.fromId, toSlotId: m.to.id, from: m.from, to: m.to.startsAt })), rows: params.rows } }, tx);
      }
      return { counts, version, moves };
    }, { timeout: 60_000, maxWait: 10_000 });
    if (!params.preview) await notify(outcome.moves.flatMap(m => [
      { userId: m.userId, category: "SELECTION" as const, title: "Изменилось время собеседования", body: `Добавили перерывы между встречами. Ваша запись перенесена с ${when(m.from)} на ${when(m.to.startsAt)} (МСК). ${interviewPlace(m.to)}. Лимит самостоятельной перезаписи не изменился.`, url: "/cabinet/interview", key: `interview-reflow:${m.bookingId}` },
      { userId: m.to.interviewerId, category: "SYSTEM" as const, title: "Изменилось время собеседования", body: `${m.name}: было ${when(m.from)}, теперь ${when(m.to.startsAt)} (МСК). ${interviewPlace(m.to)}.`, url: `/staff/applications/${m.applicationId}?stage=INTERVIEW`, key: `interview-reflow:${m.bookingId}` },
    ]), { urgent: true, now });
    return { ok: true, version: outcome.version, ...outcome.counts, message: `${params.preview ? "Проверено" : "Сохранено"} слотов: ${outcome.counts.total}. Новых: ${outcome.counts.created}, снято: ${outcome.counts.archived}, переносов: ${outcome.counts.moved}. Максимальный сдвиг: ${outcome.counts.maxShiftMinutes} мин.${params.preview ? " При сохранении участники и мастера получат уведомления." : " Изменённые записи уведомлены; самостоятельная перезапись не израсходована."}` };
  } catch (error) {
    if (error instanceof InterviewScheduleError) return { ok: false, message: error.message };
    throw error;
  }
}
