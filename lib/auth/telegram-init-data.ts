import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Проверка подписи Telegram Mini App.
 *
 * Когда сайт открывают из Telegram, страница получает строку initData —
 * кто её открыл, когда, и подпись. Подпись считается ключом, который знают
 * только Telegram и наш бот. Проверив её, сайт может впустить человека
 * без пароля: личность уже доказана Telegram.
 *
 * Всё держится на этой проверке, поэтому она написана буквально по
 * описанию Telegram и покрыта тестами:
 *
 *   ключ    = HMAC_SHA256(токен бота, ключ «WebAppData»)
 *   строка  = все поля кроме hash, «имя=значение», отсортированы, через \n
 *   подпись = HMAC_SHA256(строка, ключ)
 *
 * Отдельно проверяется возраст: подписанную строку можно подсмотреть и
 * переслать, поэтому вчерашняя не годится.
 */

export interface TelegramWebAppUser {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}

export type InitDataCheck =
  | { ok: true; user: TelegramWebAppUser; authDate: Date }
  | { ok: false; reason: "no_signature" | "bad_signature" | "expired" | "no_user" };

/** Сколько живёт подписанная строка. Сутки: дольше держать её незачем. */
export const INIT_DATA_MAX_AGE_SECONDS = 24 * 60 * 60;

export function checkInitData(
  initData: string,
  botToken: string,
  now: Date = new Date(),
): InitDataCheck {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash || !botToken) return { ok: false, reason: "no_signature" };

  // Строка для проверки — всё, кроме самой подписи, по алфавиту.
  const pairs: string[] = [];
  for (const [key, value] of params) {
    if (key === "hash") continue;
    pairs.push(`${key}=${value}`);
  }
  pairs.sort();

  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret)
    .update(pairs.join("\n"))
    .digest("hex");

  if (!equalHex(expected, hash)) return { ok: false, reason: "bad_signature" };

  /*
   * Возраст считаем только после успешной подписи.
   *
   * До неё auth_date — это просто число, которое прислал кто угодно, и
   * отказывать по нему значило бы обсуждать данные, которым мы ещё не
   * поверили.
   */
  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate)) return { ok: false, reason: "expired" };

  const age = Math.floor(now.getTime() / 1000) - authDate;
  if (age > INIT_DATA_MAX_AGE_SECONDS || age < -60) {
    return { ok: false, reason: "expired" };
  }

  const raw = params.get("user");
  if (!raw) return { ok: false, reason: "no_user" };

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "no_user" };
  }

  const person = parsed as {
    id?: number;
    first_name?: string;
    last_name?: string;
    username?: string;
  };

  if (typeof person.id !== "number") return { ok: false, reason: "no_user" };

  return {
    ok: true,
    // В базе телеграмовский номер лежит строкой — приводим здесь, чтобы
    // вызывающему не пришлось помнить об этом.
    user: {
      id: String(person.id),
      firstName: person.first_name ?? null,
      lastName: person.last_name ?? null,
      username: person.username ?? null,
    },
    authDate: new Date(authDate * 1000),
  };
}

/** Сравнение подписей за постоянное время: иначе её можно подобрать по замерам. */
function equalHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
