/** Почта как ключ человека: без пробелов и регистра — «Ivan@Mail.ru» и «ivan@mail.ru» одно и то же. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
