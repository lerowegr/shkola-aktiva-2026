/**
 * Входы для показа сайта: тех.админ и кандидат с паролями.
 *
 * Кандидаты по задумке входят через Telegram, но пока
 * нет ни бота, ни почты, показывать сайт иначе нечем: оба входят через
 * блок «Тестовый вход» на странице входа по коротким логинам admin и
 * kandidat (lib/auth/preview-login.ts).
 *
 * Пароли случайные и меняются при каждом запуске — превью открыто всему
 * интернету, «admin/admin» здесь не годится. Пишутся в .preview-accounts.txt
 * (в git не попадает). На боевой базе скрипт не работает.
 *
 * Запуск: npm run db:preview-accounts
 */
import { randomInt } from "node:crypto";
import { writeFileSync } from "node:fs";

import { hashPassword } from "../lib/auth/password";
import { db } from "../lib/db";

if (process.env.NODE_ENV === "production") {
  console.error("Входы для показа на боевой базе не создаются.");
  process.exit(1);
}

// Без похожих знаков (0/o, 1/l/i): пароль вводят руками, часто с телефона.
// 10 знаков из 31 — около 50 бит; вместе с лимитом попыток на вход хватает.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const password = () => Array.from({ length: 10 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

async function account(email: string, firstName: string, lastName: string, roleSlug: string | null) {
  const plain = password();
  const passwordHash = await hashPassword(plain);
  const user = await db.user.upsert({
    where: { email },
    create: { email, firstName, lastName, passwordHash },
    update: { passwordHash, status: "ACTIVE" },
    select: { id: true },
  });

  await db.userRole.deleteMany({ where: { userId: user.id } });
  if (roleSlug) {
    const role = await db.role.findUniqueOrThrow({ where: { slug: roleSlug }, select: { id: true } });
    await db.userRole.create({ data: { userId: user.id, roleId: role.id } });
  }
  // Старые входы этого аккаунта больше не действуют: пароль сменился.
  await db.session.deleteMany({ where: { userId: user.id } });
  return plain;
}

async function main() {
  const admin = await account("admin@demo.local", "Демо", "Админ", "admin");
  const candidate = await account("kandidat@demo.local", "Демо", "Кандидат", null);

  writeFileSync(
    ".preview-accounts.txt",
    [
      "Входы для показа сайта. Страница /login, блок «Тестовый вход» сверху.",
      "Блок виден, когда сервер запущен с NUXT_PUBLIC_PREVIEW_LOGINS=true.",
      "Пароли меняются при каждом запуске npm run db:preview-accounts.",
      "",
      "Тех.админ (все права, кабинет организатора):",
      "  логин:  admin",
      `  пароль: ${admin}`,
      "",
      "Кандидат (кабинет кандидата, анкета, мини-игры):",
      "  логин:  kandidat",
      `  пароль: ${candidate}`,
      "",
    ].join("\n"),
  );
  console.log("Готово: входы записаны в .preview-accounts.txt");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
