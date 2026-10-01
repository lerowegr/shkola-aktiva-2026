/**
 * Накатить миграции на тестовую базу.
 *
 * Вызывается после каждого `npm run db:migrate`: без этого тесты падают с
 * «column does not exist» — схема в разработке ушла вперёд, а sha_test
 * осталась на старой.
 */
import { execSync } from "node:child_process";

const dev = process.env.DATABASE_URL;
if (!dev) throw new Error("Не задана DATABASE_URL.");

const url = new URL(process.env.TEST_DATABASE_URL ?? dev);
if (!process.env.TEST_DATABASE_URL) url.pathname = "/sha_test";

execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url.toString() },
});
