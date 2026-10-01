import { db } from "~~/lib/db";
import type { NotificationCategory, NotificationChannel } from "~~/lib/generated/prisma/enums";

import { CATEGORIES, channelEnabled, EXTERNAL_CHANNELS, type ExternalChannel } from "./categories";

/** Сколько уведомлений показывает колокольчик. Старые — не новость. */
export const INBOX_LIMIT = 20;

export interface InboxItem {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string | null;
  url: string | null;
  read: boolean;
  createdAt: Date;
}

export async function readInbox(userId: string): Promise<{ items: InboxItem[]; unread: number }> {
  const [rows, unread] = await Promise.all([
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: INBOX_LIMIT,
      select: { id: true, category: true, title: true, body: true, url: true, readAt: true, createdAt: true },
    }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);

  return {
    items: rows.map(({ readAt, ...row }) => ({ ...row, read: readAt !== null })),
    unread,
  };
}

/** Отметить прочитанными: перечисленные или все сразу. Только свои. */
export async function markRead(userId: string, ids: string[] | null): Promise<void> {
  await db.notification.updateMany({
    where: { userId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
}

export interface PreferenceRow {
  category: NotificationCategory;
  label: string;
  description: string;
  channels: Record<ExternalChannel, boolean>;
}

export async function readPreferences(userId: string, isStaff: boolean): Promise<PreferenceRow[]> {
  const prefs = await db.notificationPreference.findMany({
    where: { userId },
    select: { channel: true, category: true, enabled: true },
  });

  return (Object.keys(CATEGORIES) as NotificationCategory[])
    .filter((category) => isStaff || !CATEGORIES[category].staffOnly)
    .map((category) => ({
      category,
      label: CATEGORIES[category].label,
      description: CATEGORIES[category].description,
      channels: Object.fromEntries(
        EXTERNAL_CHANNELS.map((channel) => [channel, channelEnabled(prefs, channel, category)]),
      ) as Record<ExternalChannel, boolean>,
    }));
}

export async function setPreference(
  userId: string,
  channel: NotificationChannel,
  category: NotificationCategory,
  enabled: boolean,
): Promise<void> {
  await db.notificationPreference.upsert({
    where: { userId_channel_category: { userId, channel, category } },
    create: { userId, channel, category, enabled },
    update: { enabled },
  });
}
