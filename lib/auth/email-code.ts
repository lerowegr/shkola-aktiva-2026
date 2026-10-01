import { createHash, randomInt, timingSafeEqual } from "node:crypto";

import { db } from "~~/lib/db";
import { sendMail } from "~~/lib/mail";

/**
 * Вход кандидата по почте: одноразовый код из письма.
 *
 * Код, а не ссылка: ссылку из письма открывают в почтовом приложении или
 * во встроенном браузере Telegram, и сессия оседает не там, где человек
 * начинал вход. Шесть цифр переносятся руками куда угодно.
 *
 * Шесть цифр — это миллион вариантов, поэтому защита держится на
 * ограничениях сразу: код живёт десять минут, на каждый код пять попыток,
 * новый код — не чаще раза в минуту и не больше пяти в час. Итого не больше
 * 25 догадок в час на адрес — за сутки шанс угадать меньше десятой доли
 * процента.
 *
 * В базе лежит не код, а его хеш с секретом сервера: утечка таблицы не
 * должна пускать в чужие кабинеты.
 */
export const EMAIL_CODE_TTL_MINUTES = 10;
export const EMAIL_CODE_MAX_ATTEMPTS = 5;
export const EMAIL_CODE_RESEND_SECONDS = 60;
export const EMAIL_CODES_PER_HOUR = 5;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashCode(email: string, code: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHash("sha256").update(`${secret}:${email}:${code}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

export type RequestResult = { ok: true } | { ok: false; reason: "too_often" };

export async function requestEmailCode(rawEmail: string): Promise<RequestResult> {
  const email = normalizeEmail(rawEmail);

  const [lastMinute, lastHour] = await Promise.all([
    db.emailLoginCode.count({
      where: { email, createdAt: { gt: new Date(Date.now() - EMAIL_CODE_RESEND_SECONDS * 1000) } },
    }),
    db.emailLoginCode.count({
      where: { email, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } },
    }),
  ]);

  if (lastMinute > 0 || lastHour >= EMAIL_CODES_PER_HOUR) {
    return { ok: false, reason: "too_often" };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");

  await db.emailLoginCode.create({
    data: {
      email,
      codeHash: hashCode(email, code),
      expiresAt: new Date(Date.now() + EMAIL_CODE_TTL_MINUTES * 60 * 1000),
    },
  });

  /*
   * Письмо уходит и на адрес заблокированного, и на незнакомый: по ответу
   * сайта нельзя понять, есть ли человек в системе и закрыт ли ему доступ.
   * Это выясняется только тем, кто владеет ящиком.
   */
  await sendMail({
    to: email,
    subject: `${code} — код для входа в Школу Актива`,
    text:
      `Ваш код для входа: ${code}\n\n` +
      `Он действует ${EMAIL_CODE_TTL_MINUTES} минут. Если вы не входили на сайт Школы Актива, ` +
      `просто проигнорируйте это письмо.`,
  });

  return { ok: true };
}

export type VerifyResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "wrong" | "expired" | "too_many" | "blocked" };

export async function verifyEmailCode(rawEmail: string, rawCode: string): Promise<VerifyResult> {
  const email = normalizeEmail(rawEmail);
  const code = rawCode.replace(/\D/g, "");

  // Действует только последний выданный код: старые из прошлых писем мертвы.
  const row = await db.emailLoginCode.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" },
  });

  if (!row || row.consumedAt || row.expiresAt <= new Date()) {
    return { ok: false, reason: "expired" };
  }

  if (row.attempts >= EMAIL_CODE_MAX_ATTEMPTS) return { ok: false, reason: "too_many" };

  if (!sameHash(hashCode(email, code), row.codeHash)) {
    await db.emailLoginCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "wrong" };
  }

  // Гасим условием: два одновременных запроса с верным кодом — одна победа.
  const { count } = await db.emailLoginCode.updateMany({
    where: { id: row.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (count === 0) return { ok: false, reason: "expired" };

  const existing = await db.user.findUnique({
    where: { email },
    select: { status: true },
  });
  if (existing?.status === "BLOCKED") return { ok: false, reason: "blocked" };

  const user = await db.user.upsert({
    where: { email },
    create: { email, emailVerifiedAt: new Date() },
    update: { emailVerifiedAt: new Date() },
    select: { id: true },
  });

  return { ok: true, userId: user.id };
}
