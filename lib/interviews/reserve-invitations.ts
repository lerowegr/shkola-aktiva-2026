import { z } from "zod";
import { db } from "~~/lib/db";
import { writeAudit } from "~~/lib/audit";
import { loadUser } from "~~/lib/auth/actor";
import { can } from "~~/lib/permissions";
import { notify } from "~~/lib/notifications/notify";
import { fullName } from "~~/lib/applications/staff";
import { BOOKING_LOCK } from "./rules";
import { stageState } from "~~/lib/stages";

const jobId = (seasonId: string) => `interview-reserve-invites:${seasonId}`;
const jobSchema = z.object({ seasonId: z.string(), actorId: z.string(), applicationIds: z.array(z.string()), sendAt: z.string().datetime(), status: z.enum(["PENDING", "RUNNING", "DONE"]), leaseUntil: z.string().datetime().nullable().optional(), sent: z.number().optional() });

async function eligible(seasonId: string, applicationIds?: string[]) {
  return db.application.findMany({ where: {
    seasonId, ...(applicationIds ? { id: { in: applicationIds } } : {}), status: "SUBMITTED",
    assessment: { is: { group: { session: { is: { reserve: true } } } } },
    assessmentInvite: { is: { attended: true } }, bookings: { none: { cancelledAt: null } },
    decisions: { none: { stageKind: "INTERVIEW", publishedAt: { not: null } } },
    user: { status: "ACTIVE", isOwner: false, roles: { none: {} }, notifications: { none: { key: `interview-invite:${seasonId}` } } },
  }, select: { id: true, userId: true, firstName: true, lastName: true, middleName: true, user: { select: { faculty: true } } }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
}

export async function previewReserveInvitations(seasonId: string) {
  const [people, setting] = await Promise.all([eligible(seasonId), db.settings.findUnique({ where: { id: jobId(seasonId) } })]);
  const job = jobSchema.safeParse(setting?.data);
  return { people: people.map(p => ({ applicationId: p.id, name: fullName(p), faculty: p.user.faculty })), scheduled: job.success ? { sendAt: job.data.sendAt, status: job.data.status, count: job.data.applicationIds.length, sent: job.data.sent ?? 0 } : null };
}

export async function scheduleReserveInvitations(seasonId: string, actorId: string, sendAt: Date, now = new Date()) {
  const actor = await loadUser(actorId);
  if (!actor || actor.status !== "ACTIVE" || !can(actor, "interviews.manage")) return { ok: false, message: "Нет права приглашать на собеседования." };
  const local = new Date(+sendAt + 3 * 60 * 60_000);
  if (!Number.isFinite(+sendAt) || sendAt <= now || +sendAt - +now > 7 * 86400_000 || local.getUTCHours() !== 8 || local.getUTCMinutes() !== 0 || local.getUTCSeconds() !== 0) return { ok: false, message: "Выберите будущую дату в 08:00 по Москве в пределах недели." };
  return db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK})`);
    const existing = jobSchema.safeParse((await tx.settings.findUnique({ where: { id: jobId(seasonId) } }))?.data);
    if (existing.success && existing.data.status !== "DONE") return { ok: false, message: "Рассылка резерву уже запланирована. Дождитесь её выполнения." };
    const people = await eligible(seasonId);
    if (!people.length) return { ok: false, message: "Нет новых участников резервного ЦО без записи и приглашения." };
    const data = { seasonId, actorId, applicationIds: people.map(p => p.id), sendAt: sendAt.toISOString(), status: "PENDING" as const };
    await tx.settings.upsert({ where: { id: jobId(seasonId) }, create: { id: jobId(seasonId), data }, update: { data } });
    await writeAudit({ actorId, action: "interview.reserve_invites_schedule", entityType: "season", entityId: seasonId, meta: { count: people.length, sendAt, applicationIds: data.applicationIds } }, tx);
    return { ok: true, count: people.length, message: `На 08:00 МСК запланировано приглашений: ${people.length}. Перед отправкой допуск и запись проверятся повторно.` };
  });
}

export async function materializeReserveInvitations(now = new Date()) {
  const season = await db.season.findFirst({ where: { isCurrent: true }, select: { id: true, stages: { where: { kind: "INTERVIEW" }, select: { mode: true, opensAt: true, closesAt: true } } } });
  if (!season?.stages[0] || stageState(season.stages[0], now) !== "open") return;
  const initial = jobSchema.safeParse((await db.settings.findUnique({ where: { id: jobId(season.id) } }))?.data);
  if (!initial.success || initial.data.status === "DONE" || new Date(initial.data.sendAt) > now) return;
  const job = await db.$transaction(async tx => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${BOOKING_LOCK})`);
    const parsed = jobSchema.safeParse((await tx.settings.findUnique({ where: { id: jobId(season.id) } }))?.data);
    if (!parsed.success || parsed.data.status === "DONE" || new Date(parsed.data.sendAt) > now || (parsed.data.status === "RUNNING" && parsed.data.leaseUntil && new Date(parsed.data.leaseUntil) > now)) return null;
    const data = { ...parsed.data, status: "RUNNING" as const, leaseUntil: new Date(+now + 120_000).toISOString() };
    await tx.settings.update({ where: { id: jobId(season.id) }, data: { data } });
    return data;
  });
  if (!job) return;
  const people = await eligible(job.seasonId, job.applicationIds);
  const sent = await notify(people.map(p => ({ userId: p.userId, category: "SELECTION" as const, title: "Приглашение на собеседование в Школу Актива", body: "Привет!\n\nТы прошёл центр оценки — приглашаем на последний этап отбора, собеседование. Выбери в личном кабинете удобный корпус, день и время на этой неделе, с 3 по 8 ноября. Ограничений по факультетам нет.\n\nЗапись на каждый день закрывается в 20:00 по Москве накануне. Перезаписаться можно только 1 раз и не позднее 18:00 по Москве накануне собеседования.\n\nТочное место встречи и подробности тебе напишут в личные сообщения за 5 минут до начала.\n\nЖдём твою запись!", url: "/cabinet/interview", key: `interview-invite:${job.seasonId}` })), { now, urgent: true, deliverAt: now });
  const remaining = await eligible(job.seasonId, job.applicationIds);
  const data = { ...job, sent: (job.sent ?? 0) + sent, status: remaining.length ? "PENDING" as const : "DONE" as const, leaseUntil: null };
  await db.$transaction(async tx => {
    await tx.settings.update({ where: { id: jobId(job.seasonId) }, data: { data } });
    await writeAudit({ actorId: job.actorId, action: "interview.reserve_invites_send", entityType: "season", entityId: job.seasonId, meta: { sent, remaining: remaining.length, scheduledAt: job.sendAt } }, tx);
  });
}
