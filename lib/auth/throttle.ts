import { db } from "~~/lib/db";

/**
 * Защита пароля от перебора.
 *
 * Считаем промахи по адресу почты, а не по IP. IP у половины
 * организаторов общий — университетский Wi-Fi, — и лимит по нему запер бы
 * снаружи весь этаж из-за одного человека, забывшего пароль. Адрес же
 * принадлежит одному, и он же — то, что перебирают.
 *
 * Пять попыток на пятнадцать минут. Человек, который путается в пароле,
 * укладывается; перебор со скоростью 20 паролей в час не перебор.
 *
 * Дверь при этом не запирается совсем: вход через Telegram остаётся
 * доступен всегда. Иначе достаточно было бы обстрелять чужой адрес пятью
 * запросами, чтобы организатор не попал в кабинет.
 */
export const MAX_ATTEMPTS = 5;
export const WINDOW_MINUTES = 15;

export interface ThrottleState {
  blocked: boolean;
  /** Сколько попыток осталось до блокировки. */
  left: number;
  /** Через сколько минут снова можно пробовать. */
  minutes: number;
}

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
}

export async function checkThrottle(email: string): Promise<ThrottleState> {
  const attempts = await db.loginAttempt.findMany({
    where: { email, createdAt: { gte: windowStart() } },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });

  if (attempts.length < MAX_ATTEMPTS) {
    return {
      blocked: false,
      left: MAX_ATTEMPTS - attempts.length,
      minutes: 0,
    };
  }

  // Ждать надо до того момента, когда самая старая попытка выпадет из
  // окна, — а не фиксированные пятнадцать минут от последней.
  const oldest = attempts[0]!.createdAt.getTime();
  const freeAt = oldest + WINDOW_MINUTES * 60 * 1000;
  const minutes = Math.max(1, Math.ceil((freeAt - Date.now()) / 60000));

  return { blocked: true, left: 0, minutes };
}

export async function recordMiss(email: string, ip: string | null): Promise<void> {
  await db.loginAttempt.create({ data: { email, ip } });
}

/** Удачный вход стирает историю промахов по этому адресу. */
export async function clearMisses(email: string): Promise<void> {
  await db.loginAttempt.deleteMany({ where: { email } });
}

/**
 * Уборка старых записей.
 *
 * Таблица растёт только от неудачных попыток и никем не читается дальше
 * окна, поэтому чистим её попутно, а не отдельной задачей по расписанию:
 * одна задача меньше — одна поломка меньше.
 */
export async function forgetOldAttempts(): Promise<void> {
  const day = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.loginAttempt.deleteMany({ where: { createdAt: { lt: day } } });
}
