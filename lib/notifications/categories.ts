import type { NotificationCategory, NotificationChannel } from "~~/lib/generated/prisma/enums";

/**
 * Категории уведомлений и что включено по умолчанию.
 *
 * Колокольчик на сайте не выключается: это журнал того, что с человеком
 * происходило в отборе, и к нему привязаны все остальные доставки.
 * Выключаются внешние каналы — Telegram и пуш.
 *
 * «Анкеты» организаторам по умолчанию только в колокольчик: после
 * «Распределить» мастеру приходят десятки назначений разом, и столько же
 * сообщений в Telegram — это спам, а не уведомление.
 */
export type ExternalChannel = Exclude<NotificationChannel, "INAPP">;

export const EXTERNAL_CHANNELS: ExternalChannel[] = ["TELEGRAM", "PUSH"];

export const CATEGORIES: Record<
  NotificationCategory,
  { label: string; description: string; staffOnly: boolean; defaults: Record<ExternalChannel, boolean> }
> = {
  SELECTION: {
    label: "Отбор",
    description: "Открытие этапов, дедлайны и результаты",
    staffOnly: false,
    defaults: { TELEGRAM: true, PUSH: true },
  },
  MESSAGES: {
    label: "Сообщения",
    description: "Ответы организаторов и новые сообщения",
    staffOnly: false,
    defaults: { TELEGRAM: true, PUSH: true },
  },
  REVIEW: {
    label: "Анкеты на проверку",
    description: "Вам назначили анкету",
    staffOnly: true,
    defaults: { TELEGRAM: false, PUSH: false },
  },
  SYSTEM: {
    label: "Важное",
    description: "Объявления организаторов",
    staffOnly: false,
    defaults: { TELEGRAM: true, PUSH: true },
  },
};

/** Включён ли канал: явная настройка или значение по умолчанию. */
export function channelEnabled(
  prefs: readonly { channel: NotificationChannel; category: NotificationCategory; enabled: boolean }[],
  channel: ExternalChannel,
  category: NotificationCategory,
): boolean {
  const pref = prefs.find((item) => item.channel === channel && item.category === category);
  return pref ? pref.enabled : CATEGORIES[category].defaults[channel];
}
