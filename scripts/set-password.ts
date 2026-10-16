/**
 * Задать человеку новый пароль — когда приглашением не обойтись: владелец
 * при первом запуске (приглашать его некому) или организатор, у которого
 * не открывается ссылка.
 *
 * Пароль случайный, печатается один раз в этот терминал и больше нигде не
 * хранится; в базе — только хеш. Старые входы человека перестают действовать.
 *
 *   npm run user:password -- ivan@mail.ru
 *   на сервере: ./deploy/dc.sh run --rm migrate npx tsx scripts/set-password.ts ivan@mail.ru
 */
import { randomInt } from "node:crypto";

import { normalizeEmail } from "../lib/auth/email";
import { loginKind, normalizeLogin } from "../lib/auth/login";
import { hashPassword } from "../lib/auth/password";
import { db } from "../lib/db";

// Без похожих знаков (0/o, 1/l/i): пароль вводят руками, часто с телефона.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

async function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error("Укажите почту или логин: npm run user:password -- ivan@mail.ru");
    process.exit(1);
  }
  const email = loginKind(raw) === "email" ? normalizeEmail(raw) : normalizeLogin(raw);

  const user = await db.user.findUnique({
    where: loginKind(raw) === "email" ? { email } : { login: email },
    select: { id: true, status: true },
  });
  if (!user) {
    console.error(`Нет человека с почтой или логином ${email}. Владельца создаёт сид (OWNER_EMAIL), организаторов — приглашение.`);
    process.exit(1);
  }
  if (user.status !== "ACTIVE") {
    console.error(`${email} заблокирован — сначала разблокируйте в «Админка → Люди».`);
    process.exit(1);
  }

  const plain = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(plain) } });
  await db.session.deleteMany({ where: { userId: user.id } });
  await db.auditLog.create({ data: { action: "user.password_reset", entityType: "user", entityId: user.id, meta: { via: "script" } } });

  console.log(`Новый пароль для ${email}: ${plain}`);
  console.log("Сохраните его сейчас — больше он нигде не показывается.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
