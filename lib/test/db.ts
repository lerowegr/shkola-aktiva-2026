import { db } from "~~/lib/db";

/**
 * Очистка тестовой базы перед каждым тестом.
 *
 * Один TRUNCATE по всем таблицам сразу: так быстрее десятка deleteMany и
 * не надо помнить порядок внешних ключей. Таблица миграций остаётся —
 * иначе Prisma решит, что база пустая.
 *
 * Работает только на базе, чьё имя кончается на _test: случайно запущенный
 * с боевым DATABASE_URL тест не должен стереть живые данные.
 */
export async function resetDatabase(): Promise<void> {
  const name = new URL(process.env.DATABASE_URL ?? "").pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(`Отказ чистить базу «${name}»: тесты работают только с *_test.`);
  }

  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;

  if (rows.length === 0) return;

  const list = rows.map((row) => `"public"."${row.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} CASCADE`);
}
