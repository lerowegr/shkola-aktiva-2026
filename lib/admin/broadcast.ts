import { randomBytes } from "node:crypto";

import { db } from "~~/lib/db";
import { notify } from "~~/lib/notifications/notify";


/**
 * Рассылки по сегментам: «всем, кто не отправил анкету — до дедлайна
 * сутки», «отправившим анкету, но не записавшимся на собеседование».
 * Отсева между этапами нет — решение одно, итог отбора.
 *
 * Уходят уведомлением категории «Важное»: в колокольчик и во все каналы,
 * которые человек не выключил. Заблокированным — никогда.
 */
import { SEGMENTS, type Segment } from "./segments";

export { SEGMENTS, type Segment };

function published(outcome: "PASSED" | "REJECTED") {
  return { decisions: { some: { stageKind: "INTERVIEW" as const, outcome, publishedAt: { not: null } } } };
}

export async function segmentUserIds(seasonId: string, segment: Segment): Promise<string[]> {
  if (segment === "staff") {
    const staff = await db.user.findMany({
      where: { status: "ACTIVE", OR: [{ isOwner: true }, { roles: { some: {} } }] },
      select: { id: true },
    });
    return staff.map((user) => user.id);
  }

  if (segment === "candidates") {
    const candidates = await db.user.findMany({
      where: { status: "ACTIVE", isOwner: false, roles: { none: {} } },
      select: { id: true },
    });
    return candidates.map((user) => user.id);
  }

  const where = {
    drafts: { status: "DRAFT" as const },
    submitted: { status: "SUBMITTED" as const },
    homework_submitted: { submissions: { some: { stageKind: "HOMEWORK" as const, replacedAt: null } } },
    in_assessment: { assessment: { isNot: null } },
    not_booked: { status: "SUBMITTED" as const, bookings: { none: { cancelledAt: null } } },
    booked: { bookings: { some: { cancelledAt: null } } },
    accepted: published("PASSED"),
    rejected: published("REJECTED"),
  }[segment];

  const applications = await db.application.findMany({
    where: { seasonId, user: { status: "ACTIVE" }, ...where },
    select: { userId: true },
  });
  return [...new Set(applications.map((application) => application.userId))];
}

export async function sendBroadcast(params: {
  seasonId: string;
  segment: Segment;
  title: string;
  body: string | null;
  url: string | null;
}): Promise<number> {
  const userIds = await segmentUserIds(params.seasonId, params.segment);
  // Свой ключ на каждую рассылку: повторная отправка того же текста — новое
  // событие, а двойной клик по кнопке — нет (кнопка ждёт ответа).
  const key = `broadcast:${randomBytes(6).toString("hex")}`;
  return notify(
    userIds.map((userId) => ({
      userId,
      category: "SYSTEM" as const,
      title: params.title,
      body: params.body,
      url: params.url,
      key,
    })),
  );
}
