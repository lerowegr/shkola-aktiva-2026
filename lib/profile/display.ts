/**
 * Публичное имя для рейтинга: ник или обезличенный код.
 *
 * Модуль чистый — им пользуются и сервер (таблицы рейтинга), и страницы
 * (подписи). Порядок и число регистраций наружу не выходят: код не
 * обратим и не упорядочен.
 */
export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 20;
const NICKNAME_RE = /^[A-Za-zА-Яа-яЁё0-9_]+$/u;

const RESERVED = new Set(
  ["admin", "админ", "администратор", "организатор", "организаторы", "master", "support", "поддержка", "sha", "ша", "moderator", "модератор"].map((word) =>
    word.toLowerCase(),
  ),
);

/** Ник строчными для уникальности без учёта регистра. */
export function normalizeNickname(nickname: string): string {
  return nickname.trim().toLowerCase();
}

/** Чем плох ник: причина или null. */
export function nicknameError(nickname: string): string | null {
  const trimmed = nickname.trim();
  if (!trimmed) return "Придумайте ник.";
  if ([...trimmed].length < NICKNAME_MIN || [...trimmed].length > NICKNAME_MAX) {
    return `Ник — от ${NICKNAME_MIN} до ${NICKNAME_MAX} символов.`;
  }
  if (!NICKNAME_RE.test(trimmed)) return "Только буквы, цифры и подчёркивание.";
  if (RESERVED.has(trimmed.toLowerCase())) return "Этот ник занят организаторами.";
  return null;
}

/** Обезличенный код из порядкового номера: 4 символа, порядок не читается. */
export function fallbackCode(seq: number): string {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  let hash = (Math.imul(seq, 2654435761) ^ 0x9e3779b9) >>> 0;
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += alphabet[hash % alphabet.length];
    hash = Math.floor(hash / alphabet.length);
  }
  return code;
}

/** Что показать в рейтинге: ник или «Игрок К7М2». */
export function displayName(user: { nickname: string | null; seq: number }): string {
  if (user.nickname) return user.nickname;
  return `Игрок ${fallbackCode(user.seq)}`;
}

/** Буквы для заглушки аватарки: первые два символа имени. */
export function avatarLetters(name: string): string {
  return [...name.trim()].slice(0, 2).join("").toUpperCase();
}
