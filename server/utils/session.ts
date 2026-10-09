import { randomBytes } from "node:crypto";

import { loadUser, ForbiddenError, type CurrentUser } from "~~/lib/auth/actor";
import { db } from "~~/lib/db";
import { can } from "~~/lib/permissions";

/**
 * Кто сейчас на сайте.
 *
 * Сессии лежат в базе: заблокировать человека нужно сразу, а не когда у
 * него истечёт подписанный токен. Ответ кешируется в контексте запроса —
 * сколько бы обработчиков ни спросило пользователя, в базу сходим один раз.
 */

/*
 * Тип события берём из глобального H3Event, который подставляет Nitro.
 *
 * Версия h3 прибита через overrides: @nuxt/eslint тянет предрелизную 2.x,
 * она оказывается в корне node_modules, и типы разъезжаются. Симптом
 * обманчивый — выведенный тип ответа обработчика становится «{}».
 */
export type AppEvent = InstanceType<typeof H3Event>;

const COOKIE = "sha_session";
const SECURE_COOKIE = "__Secure-sha_session";

/** Сколько живёт сессия. */
const SESSION_DAYS = 30;

/** На https кука получает приставку __Secure- и флаг secure. */
export function useSecureCookies(): boolean {
  return (process.env.NUXT_PUBLIC_APP_URL ?? "").startsWith("https://");
}

function readToken(event: AppEvent): string | undefined {
  return getCookie(event, SECURE_COOKIE) ?? getCookie(event, COOKIE);
}

export async function startSession(event: AppEvent, userId: string): Promise<void> {
  const secure = useSecureCookies();
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await db.session.create({ data: { sessionToken: token, userId, expires } });

  setCookie(event, secure ? SECURE_COOKIE : COOKIE, token, {
    httpOnly: true,
    /*
     * «none» — чтобы сессия доезжала внутрь Telegram.
     *
     * На компьютере Telegram показывает Mini App в рамке на своей странице.
     * Для браузера это чужой сайт, и куку с «lax» он туда не отдаёт.
     * Защиту от подделки запросов с чужих сайтов, которую давал «lax»,
     * держит server/middleware/origin.ts.
     *
     * Без https «none» браузеры не принимают, поэтому локально — «lax».
     */
    sameSite: secure ? "none" : "lax",
    path: "/",
    secure,
    expires,
  });

  // Дальше по этому же запросу человек уже вошёл.
  event.context.appUser = undefined;
}

/** Выйти: удалить сессию из базы и куку из браузера. */
export async function endSession(event: AppEvent): Promise<void> {
  const token = readToken(event);
  if (token) await db.session.deleteMany({ where: { sessionToken: token } });

  deleteCookie(event, COOKIE, { path: "/" });
  deleteCookie(event, SECURE_COOKIE, { path: "/", secure: true });
  event.context.appUser = null;
}

export async function currentUser(event: AppEvent): Promise<CurrentUser | null> {
  if (event.context.appUser !== undefined) {
    return event.context.appUser as CurrentUser | null;
  }

  const token = readToken(event);
  let user: CurrentUser | null = null;

  if (token) {
    const session = await db.session.findUnique({
      where: { sessionToken: token },
      select: { userId: true, expires: true },
    });

    if (session && session.expires > new Date()) {
      user = await loadUser(session.userId);
    }
  }

  /*
   * Заблокированный не проходит дальше этой строки. Здесь — единственное
   * место, где сессия превращается в человека, поэтому отказ отсюда
   * действует на всё сразу и не может быть забыт в следующем обработчике.
   */
  if (user?.status === "BLOCKED") user = null;

  event.context.appUser = user;
  return user;
}

/** Начало обработчика, который что-то меняет и требует права. */
export async function requirePermission(event: AppEvent, permission: string): Promise<CurrentUser> {
  const user = await currentUser(event);

  if (!user) throw new ForbiddenError("Нужно войти.");
  if (!can(user, permission)) throw new ForbiddenError();

  return user;
}

/** Для действий, доступных любому вошедшему. */
export async function requireSignedIn(event: AppEvent): Promise<CurrentUser> {
  const user = await currentUser(event);
  if (!user) throw new ForbiddenError("Нужно войти.");
  return user;
}

/**
 * Для действий кандидата в отборе: анкета, тест, домашка, запись. Без
 * знакомства и согласия на обработку данных ничего из этого не принимаем —
 * страница сама уводит на /cabinet/welcome, а это — на случай прямого запроса.
 */
export async function requireProfile(event: AppEvent): Promise<CurrentUser> {
  const user = await requireSignedIn(event);
  if (user.needsProfile) {
    throw new ForbiddenError("Сначала расскажите о себе: в кабинете откроется экран «Давай познакомимся».");
  }
  return user;
}

/**
 * Для обработчиков, которые отдают данные страницам.
 *
 * Отвечаем честным 401, а не перенаправлением: перенаправляет тот, кто
 * рисует страницу, — общая проверка маршрутов на стороне браузера.
 */
export async function requireUser(event: AppEvent): Promise<CurrentUser> {
  const user = await currentUser(event);

  if (!user) {
    throw createError({ statusCode: 401, statusMessage: "Нужно войти." });
  }

  return user;
}
