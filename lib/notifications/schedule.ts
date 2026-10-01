/**
 * Когда уходит уведомление во внешние каналы — Telegram и пуш.
 *
 * Через минуту, а не сразу: если человек сейчас на сайте, он увидит
 * колокольчик и прочитает — и тогда в Telegram дублировать незачем.
 *
 * Ночью (23:00–08:00 по Москве) несрочное ждёт утра. Кандидатам 17–20 лет,
 * и «вам ответили» в два часа ночи — плохой способ познакомиться.
 * Срочное (дедлайн через час) уходит всегда.
 */
export const DELIVERY_DELAY_MS = 60 * 1000;

const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;
const QUIET_FROM = 23;
const QUIET_TO = 8;

export function deliveryTime(now: Date, options: { urgent: boolean }): Date {
  const at = new Date(now.getTime() + DELIVERY_DELAY_MS);
  if (options.urgent) return at;

  // Часы по Москве: сдвигаем время и читаем его как UTC.
  const moscow = new Date(at.getTime() + MOSCOW_OFFSET_MS);
  const hour = moscow.getUTCHours();

  if (hour >= QUIET_TO && hour < QUIET_FROM) return at;

  const morning = new Date(moscow);
  morning.setUTCHours(QUIET_TO, 0, 0, 0);
  if (hour >= QUIET_FROM) morning.setUTCDate(morning.getUTCDate() + 1);

  return new Date(morning.getTime() - MOSCOW_OFFSET_MS);
}
