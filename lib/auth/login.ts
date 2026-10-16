/**
 * Логин для самостоятельной регистрации.
 *
 * Модуль чистый: одни правила для формы и для сервера. Логин — латиница,
 * цифры, «_» и «.», начинается с буквы, 3–32 знака, без учёта регистра:
 * «Anna.K» и «anna.k» — один логин. «@» нельзя — по нему вход отличает
 * логин от почты.
 */
export const LOGIN_MIN = 3;
export const LOGIN_MAX = 32;

export function normalizeLogin(raw: string): string {
  return raw.trim().toLowerCase();
}

export function loginProblem(raw: string): string | null {
  const value = normalizeLogin(raw);
  if (!value) return "Придумайте логин.";
  if (value.length < LOGIN_MIN) return `Логин — от ${LOGIN_MIN} знаков.`;
  if (value.length > LOGIN_MAX) return `Логин — до ${LOGIN_MAX} знаков.`;
  if (!/^[a-z]/.test(value)) return "Логин начинается с латинской буквы.";
  if (!/^[a-z][a-z0-9_.]*$/.test(value)) return "В логине — только латиница, цифры, «_» и «.».";
  if (/[._]{2}|[._]$/.test(value)) return "«_» и «.» не ставятся подряд и в конце.";
  return null;
}

/** Что ввели в поле входа: почту или логин. */
export function loginKind(raw: string): "email" | "login" {
  return raw.includes("@") ? "email" : "login";
}
