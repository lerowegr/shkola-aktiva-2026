import { fullName } from "~~/lib/applications/staff";
import { auditLabel } from "~~/lib/audit-labels";
import { displayName } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";

/**
 * Лента журнала действий для админки: свежие сверху, страницами по 50.
 * Следующая страница — по времени последней записи, а не по номеру:
 * пока читаешь, сверху появляются новые записи, и номера бы съехали.
 */
export const AUDIT_PAGE = 50;

export interface AuditRow {
  id: string;
  action: string;
  label: string;
  actor: string | null;
  /** Над кем или чем действие: кандидат, организатор, роль. null — если уже удалено или не про человека. */
  subject: string | null;
  entityType: string | null;
  entityId: string | null;
  meta: unknown;
  ip: string | null;
  createdAt: Date;
}

export async function listAudit(params: { action?: string; group?: string; actorId?: string; before?: Date }) {
  const rows = await db.auditLog.findMany({
    where: {
      ...(params.action ? { action: params.action } : {}),
      ...(params.group ? { action: { startsWith: `${params.group}.` } } : {}),
      ...(params.actorId ? { actorId: params.actorId } : {}),
      ...(params.before ? { createdAt: { lt: params.before } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: AUDIT_PAGE + 1,
    select: {
      id: true,
      action: true,
      entityType: true,
      entityId: true,
      meta: true,
      ip: true,
      createdAt: true,
      actor: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } },
    },
  });

  const page = rows.slice(0, AUDIT_PAGE);
  const names = await subjects(page);
  return {
    rows: page.map(
      (row): AuditRow => ({
        id: row.id,
        action: row.action,
        label: auditLabel(row.action),
        actor: row.actor ? displayName(row.actor) : null,
        subject: names.get(`${row.entityType}:${row.entityId}`) ?? null,
        entityType: row.entityType,
        entityId: row.entityId,
        meta: row.meta,
        ip: row.ip,
        createdAt: row.createdAt,
      }),
    ),
    more: rows.length > AUDIT_PAGE,
  };
}

/**
 * Имена тех, над кем действовали, — одним запросом на вид сущности.
 * Берём текущие: «балл по критерию» без имени кандидата не разобрать,
 * а id в журнале человеку ничего не говорит.
 */
async function subjects(rows: { entityType: string | null; entityId: string | null }[]): Promise<Map<string, string>> {
  const ids = (type: string) => [
    ...new Set(rows.filter((row) => row.entityType === type && row.entityId).map((row) => row.entityId!)),
  ];
  const person = { firstName: true, lastName: true, telegramUsername: true, email: true } as const;
  const applicant = { lastName: true, firstName: true, middleName: true } as const;

  const [users, applications, reviews, roles] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids("user") } }, select: { id: true, ...person } }),
    db.application.findMany({ where: { id: { in: ids("application") } }, select: { id: true, ...applicant } }),
    db.review.findMany({
      where: { id: { in: ids("review") } },
      select: { id: true, application: { select: applicant } },
    }),
    db.role.findMany({ where: { id: { in: ids("role") } }, select: { id: true, name: true } }),
  ]);

  return new Map([
    ...users.map((user) => [`user:${user.id}`, displayName(user)] as const),
    ...applications.map((application) => [`application:${application.id}`, fullName(application)] as const),
    ...reviews.map((review) => [`review:${review.id}`, fullName(review.application)] as const),
    ...roles.map((role) => [`role:${role.id}`, role.name] as const),
  ]);
}
