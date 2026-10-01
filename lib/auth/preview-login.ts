/**
 * Тестовый вход для показа сайта — по короткому логину вместо почты.
 *
 * Пока нет ни бота, ни почты, войти на превью можно только паролем.
 * Тестовые аккаунты живут на адресах @demo.local (npm run db:preview-accounts),
 * а на странице входа достаточно набрать «admin» или «kandidat».
 *
 * Включается только переменной NUXT_PUBLIC_PREVIEW_LOGINS=true. Без неё
 * логин без «@» остаётся тем, что ввели, — и не подходит ни к кому.
 */
export const PREVIEW_DOMAIN = "demo.local";

export function loginToEmail(login: string, previewLogins: boolean): string {
  const value = login.trim().toLowerCase();
  if (previewLogins && value && !value.includes("@")) return `${value}@${PREVIEW_DOMAIN}`;
  return value;
}
