import { displayName } from "~~/lib/auth/actor";
import { fullName, initials } from "~~/lib/applications/staff";
import { db } from "~~/lib/db";
import type { MessageAuthor, MessageVia } from "~~/lib/generated/prisma/enums";
import { notify } from "~~/lib/notifications/notify";

/**
 * Переписка кандидата с организаторами.
 *
 * Одна ветка на кандидата в сезоне и общий ящик на всех организаторов:
 * отбор — единый поток, отвечает любой, у кого есть право. Отметка
 * «прочитано организаторами» тоже общая: ответил один — ветка больше не
 * висит новой у остальных.
 *
 * Кандидат пишет на сайте или боту — сообщения попадают в одну ветку.
 * Ответ организатора кандидат получает и на сайте, и от бота.
 */
export const MESSAGE_MAX = 4000;

export async function threadFor(seasonId: string, candidateId: string) {
  return db.messageThread.upsert({
    where: { seasonId_candidateId: { seasonId, candidateId } },
    create: { seasonId, candidateId },
    update: {},
    select: { id: true, seasonId: true, candidateId: true },
  });
}

export async function postMessage(params: {
  threadId: string;
  author: MessageAuthor;
  authorId: string | null;
  text: string;
  via: MessageVia;
  now?: Date;
}) {
  const text = params.text.trim().slice(0, MESSAGE_MAX);
  const now = params.now ?? new Date();

  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({
      data: { threadId: params.threadId, author: params.author, authorId: params.authorId, text, via: params.via, createdAt: now },
    });

    await tx.messageThread.update({
      where: { id: params.threadId },
      data: {
        lastMessageAt: now,
        // Своё сообщение — прочитанное для своей стороны.
        ...(params.author === "STAFF" ? { staffReadAt: now } : {}),
        ...(params.author === "CANDIDATE" ? { candidateReadAt: now } : {}),
      },
    });

    return created;
  });

  if (params.author === "STAFF") await notifyCandidate(params.threadId, text);
  if (params.author === "CANDIDATE") await notifyStaffRecipients(params.threadId, text, now);

  return message;
}

function preview(text: string): string {
  return text.length > 140 ? `${text.slice(0, 140)}…` : text;
}

async function notifyCandidate(threadId: string, text: string) {
  const thread = await db.messageThread.findUnique({ where: { id: threadId }, select: { candidateId: true } });
  if (!thread) return;

  await notify([
    {
      userId: thread.candidateId,
      category: "MESSAGES",
      title: "Сообщение от Школы Актива",
      // Ответ целиком (в пределах сообщения Telegram): человек должен
      // прочитать его там, где получил, не переходя на сайт.
      body: text.slice(0, 1500),
      url: "/cabinet/messages",
    },
  ]);
}

/** Уведомления о вопросе: мастер текущего собеседования и дежурная команда. */
async function notifyStaffRecipients(threadId: string, text: string, now = new Date()) {
  const thread = await db.messageThread.findUnique({
    where: { id: threadId },
    select: {
      seasonId: true,
      candidate: {
        select: {
          firstName: true,
          lastName: true,
          telegramUsername: true,
          email: true,
          applications: { select: { seasonId: true, bookings: { where: { cancelledAt: null, slot: { archivedAt: null } }, select: { slotId: true, slot: { select: { interviewers: { select: { userId: true } } } } } } } },
        },
      },
    },
  });
  if (!thread) return;

  const interviewSlots = new Map(thread.candidate.applications.filter(a => a.seasonId === thread.seasonId).flatMap(a => a.bookings.flatMap(b => b.slot.interviewers.map(i => [i.userId, b.slotId] as const))));
  const staff = await db.user.findMany({
    where: { status: "ACTIVE", OR: [{ isOwner: true }, { roles: { some: { role: { permissions: { has: "messages.reply" } } } } }] },
    select: { id: true, firstName: true, lastName: true, isOwner: true, roles: { select: { role: { select: { slug: true } } } } },
  });
  const namedRecipients = new Set(["мария новоселова", "катерина кизяева", "лера полякова"]);
  const recipients = new Set(interviewSlots.keys());
  for (const person of staff) {
    const name = `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim().toLocaleLowerCase("ru-RU").replaceAll("ё", "е");
    if (person.isOwner || person.roles.some(({ role }) => role.slug === "admin") || namedRecipients.has(name)) recipients.add(person.id);
  }

  await notify(
    [...recipients].map((userId) => ({
      userId,
      category: "MESSAGES" as const,
      title: `${displayName(thread.candidate)} написал(а)`,
      body: interviewSlots.has(userId) ? text.slice(0, 3500) : preview(text),
      url: interviewSlots.has(userId) ? `/staff/interviews?botSlot=${interviewSlots.get(userId)}` : `/staff/messages?thread=${threadId}`,
    })),
    interviewSlots.size ? { urgent: true, now, deliverAt: now } : {},
  );
}

export async function markThreadRead(threadId: string, side: "staff" | "candidate", now = new Date()) {
  await db.messageThread.update({
    where: { id: threadId },
    data: side === "staff" ? { staffReadAt: now } : { candidateReadAt: now },
  });
}

/** Новое для стороны: последнее сообщение не её и пришло после её отметки. */
export function isUnread(
  thread: { lastMessageAt: Date; staffReadAt: Date | null; candidateReadAt: Date | null },
  side: "staff" | "candidate",
): boolean {
  const readAt = side === "staff" ? thread.staffReadAt : thread.candidateReadAt;
  return readAt === null || thread.lastMessageAt > readAt;
}

// ---------------------------------------------------------------------------
// Для организаторов
// ---------------------------------------------------------------------------

export interface ThreadRow {
  id: string;
  name: string;
  initials: string;
  telegramUsername: string | null;
  applicationStatus: "none" | "draft" | "submitted";
  lastText: string;
  lastAuthor: MessageAuthor;
  lastMessageAt: Date;
  unread: boolean;
}

export async function listThreads(seasonId: string, query = ""): Promise<{ rows: ThreadRow[]; unread: number }> {
  const threads = await db.messageThread.findMany({
    where: { seasonId, messages: { some: {} } },
    orderBy: { lastMessageAt: "desc" },
    select: {
      id: true,
      lastMessageAt: true,
      staffReadAt: true,
      candidateReadAt: true,
      candidate: {
        select: {
          firstName: true,
          lastName: true,
          telegramUsername: true,
          email: true,
          applications: { where: { seasonId }, select: { lastName: true, firstName: true, middleName: true, status: true } },
        },
      },
      // Последнее сообщение людей: автоответ бота не считается — иначе он
      // «гасил» бы непрочитанный вопрос кандидата.
      messages: {
        where: { author: { not: "BOT" } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { text: true, author: true, createdAt: true },
      },
    },
  });

  const rows: ThreadRow[] = threads.map((thread) => {
    const application = thread.candidate.applications[0];
    const name = application?.lastName ? fullName(application) : displayName(thread.candidate);
    return {
      id: thread.id,
      name,
      initials: application?.lastName ? initials(application) : name.slice(0, 2).toUpperCase(),
      telegramUsername: thread.candidate.telegramUsername,
      applicationStatus: !application ? "none" : application.status === "SUBMITTED" ? "submitted" : "draft",
      lastText: preview(thread.messages[0]?.text ?? ""),
      lastAuthor: thread.messages[0]?.author ?? "CANDIDATE",
      lastMessageAt: thread.lastMessageAt,
      unread:
        thread.messages[0]?.author === "CANDIDATE" &&
        (thread.staffReadAt === null || thread.messages[0].createdAt > thread.staffReadAt),
    };
  });

  const needle = query.trim().toLowerCase().replace(/^@/, "");
  const filtered = needle
    ? rows.filter((row) => [row.name, row.telegramUsername ?? ""].some((value) => value.toLowerCase().includes(needle)))
    : rows;

  return { rows: filtered, unread: rows.filter((row) => row.unread).length };
}

export interface ChatMessage {
  id: string;
  author: MessageAuthor;
  authorName: string | null;
  text: string;
  via: MessageVia;
  createdAt: Date;
}

export async function loadMessages(threadId: string): Promise<ChatMessage[]> {
  const messages = await db.message.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: {
      id: true,
      author: true,
      text: true,
      via: true,
      createdAt: true,
      authorRef: { select: { firstName: true, lastName: true, telegramUsername: true, email: true } },
    },
  });

  return messages.map((message) => ({
    id: message.id,
    author: message.author,
    authorName: message.authorRef ? displayName(message.authorRef) : null,
    text: message.text,
    via: message.via,
    createdAt: message.createdAt,
  }));
}
