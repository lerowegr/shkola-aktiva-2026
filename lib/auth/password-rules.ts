/**
 * Что считается годным паролем.
 *
 * Правил намеренно мало и все они про смысл, а не про форму. Требование
 * «заглавная, цифра и знак» не делает пароль крепче: оно делает его
 * «Ivanov2024!» — то есть предсказуемым, и заодно вынуждает записать его
 * на бумажке. Так советует NIST, и так и сделано: длина, отсутствие
 * очевидных строк и запрет собирать пароль из собственной почты.
 *
 * Файл без единого обращения к node:crypto — его читает и страница смены
 * пароля в браузере. Само хеширование живёт рядом, в password.ts, и в
 * браузер не попадает.
 */
export const MIN_LENGTH = 8;
export const MAX_LENGTH = 128;

/** Самое частое, что вводят, когда «надо придумать пароль». */
const OBVIOUS = [
  "password", "пароль", "qwerty", "йцукен", "123456", "12345678", "123456789",
  "1234567890", "11111111", "00000000", "iloveyou", "admin123", "qwerty123",
  "qwertyuiop", "abc12345", "password1", "welcome1", "shkola", "школа", "sha2026",
];

export function passwordProblem(
  plain: string,
  context: { email?: string | null; name?: string | null } = {},
): string | null {
  const value = plain.normalize("NFKC");

  if (value.length < MIN_LENGTH) {
    return `Пароль короче ${MIN_LENGTH} знаков — такой подбирают за минуты.`;
  }
  if (value.length > MAX_LENGTH) {
    return `Пароль длиннее ${MAX_LENGTH} знаков сайт не примет.`;
  }
  if (value.trim().length === 0) {
    return "Пароль из одних пробелов не годится.";
  }

  const lower = value.toLowerCase();

  if (OBVIOUS.some((item) => lower === item || lower.startsWith(item))) {
    return "Такой пароль стоит первым в любом списке для подбора. Придумайте другой.";
  }

  // Одна повторяющаяся буква любой длины — не пароль.
  if (new Set(value).size <= 2) {
    return "В пароле всего один-два разных знака. Так не пойдёт.";
  }

  const local = context.email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 3 && lower.includes(local)) {
    return "Пароль повторяет вашу почту — его угадают с первой попытки.";
  }

  return null;
}
