import { randomUUID } from "node:crypto";
import { db } from "~~/lib/db";
import { writeAudit } from "~~/lib/audit";
import { loadUser } from "~~/lib/auth/actor";
import { can } from "~~/lib/permissions";
import { BOOKING_LOCK } from "./rules";
import { cutSlots } from "./slots";
import { validInterval, type InterviewInterval } from "./import-table";
import { InterviewScheduleError, validateInterviewer } from "./scheduling";

const dayKey = (date: Date) => new Date(date.getTime() + 3 * 60 * 60_000).toISOString().slice(0, 10);

/** Предпросмотр и сохранение проходят одинаковые проверки под замком расписания. */
export async function importSchedule(params: {
  seasonId: string;
  actorId: string;
  rows: InterviewInterval[];
  preview: boolean;
}, now = new Date()) {
  const actor = await loadUser(params.actorId);
  if (!actor || actor.status !== "ACTIVE" || !can(actor, "interviews.manage")) return { ok: false, message: "Нет права изменять расписание собеседований." };
  try {
    if (!params.rows.length || params.rows.length > 500) throw new InterviewScheduleError("Вставьте от 1 до 500 интервалов.");
    const wanted = params.rows.flatMap((row, index) => {
      if (!validInterval(row) || !row.location.trim() || row.location.length > 300 || !row.interviewerId) throw new InterviewScheduleError(`Строка ${index + 1}: проверьте дату, время, корпус и мастера.`);
      const slots = cutSlots({ ...row, duration: 45, gap: 0 });
      if (!slots.length || slots[0]!.startsAt <= now) throw new InterviewScheduleError(`Строка ${index + 1}: время прошло или интервал короче 45 минут.`);
      return slots.map(slot => ({ ...slot, location: row.location.trim(), interviewerId: row.interviewerId, date: row.date }));
    }).sort((a, b) => a.interviewerId.localeCompare(b.interviewerId) || a.startsAt.getTime() - b.startsAt.getTime());
    if (wanted.length > 2000) throw new InterviewScheduleError("В расписании больше 2000 слотов. Разделите его на несколько частей.");
    for (let i = 1; i < wanted.length; i++) {
      const prev = wanted[i - 1]!, next = wanted[i]!;
      if (prev.interviewerId === next.interviewerId && prev.endsAt > next.startsAt) throw new InterviewScheduleError(`В таблице пересекаются интервалы одного мастера (${next.date}). Исправьте строки.`);
    }
    return await db.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK})`);
      const masters = [...new Set(wanted.map(s => s.interviewerId))];
      for (const id of masters) await validateInterviewer(tx, id);
      const existing = await tx.interviewSlot.findMany({
        where: { seasonId: params.seasonId, interviewers: { some: { userId: { in: masters } } } },
        select: { id: true, startsAt: true, endsAt: true, location: true, capacity: true, interviewers: { select: { userId: true } }, _count: { select: { bookings: { where: { cancelledAt: null } } } } },
        orderBy: { startsAt: "asc" },
      });
      const scope = new Set(wanted.map(s => `${s.interviewerId}:${s.date}`));
      const managed = existing.filter(s => s.interviewers.some(i => scope.has(`${i.userId}:${dayKey(s.startsAt)}`)));
      if (managed.some(s => s.interviewers.length !== 1 || s.capacity !== 1)) throw new InterviewScheduleError("В выбранные дни есть слоты старого формата. Уточните их состав перед импортом.");
      const assigned = new Map<number, typeof managed[number]>();
      const used = new Set<string>();
      // Сначала сохраняем точные совпадения, в том числе уже занятые слоты.
      for (const [index, slot] of wanted.entries()) {
        const same = managed.find(s => !used.has(s.id) && s.interviewers[0]!.userId === slot.interviewerId && +s.startsAt === +slot.startsAt && +s.endsAt === +slot.endsAt);
        if (same) { assigned.set(index, same); used.add(same.id); }
      }
      for (const [index, slot] of wanted.entries()) {
        if (assigned.has(index)) continue;
        const reusable = managed.find(s => !used.has(s.id) && !s._count.bookings && s.interviewers[0]!.userId === slot.interviewerId && dayKey(s.startsAt) === slot.date);
        if (reusable) { assigned.set(index, reusable); used.add(reusable.id); }
      }
      if (managed.some(s => !used.has(s.id))) throw new InterviewScheduleError("В эти дни уже есть дополнительные или занятые слоты, которых нет в таблице. Они не удалены. Согласуйте расписание перед повтором.");
      const updates: { id: string; startsAt: Date; endsAt: Date; location: string }[] = [];
      const creates: { id: string; startsAt: Date; endsAt: Date; location: string; interviewerId: string }[] = [];
      let unchanged = 0;
      for (const [index, slot] of wanted.entries()) {
        const old = assigned.get(index);
        const changed = old && (+old.startsAt !== +slot.startsAt || +old.endsAt !== +slot.endsAt || old.location !== slot.location);
        if (changed && old._count.bookings) throw new InterviewScheduleError(`На ${slot.date} уже есть запись участника. Занятые слоты можно менять только через индивидуальный перенос.`);
        if (changed && old!.startsAt <= now) throw new InterviewScheduleError("Прошедшие слоты не изменяются при импорте.");
        // Проверяем другие сезоны и всё, что не входит в обновляемый набор.
        const conflict = await tx.slotInterviewer.findFirst({ where: { userId: slot.interviewerId, slot: { id: { notIn: managed.map(s => s.id) }, startsAt: { lt: slot.endsAt }, endsAt: { gt: slot.startsAt } } }, select: { id: true } });
        if (conflict) throw new InterviewScheduleError(`У мастера уже есть пересекающееся собеседование (${slot.date}).`);
        if (!old) creates.push({ id: randomUUID(), startsAt: slot.startsAt, endsAt: slot.endsAt, location: slot.location, interviewerId: slot.interviewerId });
        else if (changed) updates.push({ id: old.id, startsAt: slot.startsAt, endsAt: slot.endsAt, location: slot.location });
        else unchanged++;
      }
      const counts = { created: creates.length, updated: updates.length, unchanged, total: wanted.length, masters: masters.length };
      if (!params.preview) {
        for (const update of updates) {
          const { id, ...data } = update;
          await tx.interviewSlot.update({ where: { id }, data });
        }
        if (creates.length) {
          await tx.interviewSlot.createMany({ data: creates.map(slot => ({ id: slot.id, startsAt: slot.startsAt, endsAt: slot.endsAt, location: slot.location, seasonId: params.seasonId, capacity: 1, createdById: params.actorId })) });
          await tx.slotInterviewer.createMany({ data: creates.map(s => ({ slotId: s.id, userId: s.interviewerId })) });
        }
        await writeAudit({ actorId: params.actorId, action: "interview.schedule_import", entityType: "season", entityId: params.seasonId, meta: { ...counts, before: updates.map(s => managed.find(old => old.id === s.id)), rows: params.rows } }, tx);
      }
      return { ok: true, ...counts, preview: params.preview, message: params.preview ? `Проверено слотов: ${wanted.length}. Новых: ${creates.length}, обновятся свободные: ${updates.length}, без изменений: ${unchanged}.` : `Расписание сохранено. Новых слотов: ${creates.length}, обновлено: ${updates.length}, без изменений: ${unchanged}.` };
    }, { timeout: 60_000, maxWait: 10_000 });
  } catch (error) {
    if (error instanceof InterviewScheduleError) return { ok: false, message: error.message };
    throw error;
  }
}
