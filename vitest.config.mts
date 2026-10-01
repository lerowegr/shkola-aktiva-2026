import path from "node:path";

import { config as loadEnv } from "dotenv";
import { defineConfig } from "vitest/config";

loadEnv();

/**
 * Адрес тестовой базы: тот же DATABASE_URL, что для разработки, но с
 * именем базы sha_test. Логины и пароли выходят те же, что уже работают на
 * этой машине, а данные разработки не страдают: тесты чистят свою базу.
 */
function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;

  const dev = process.env.DATABASE_URL;
  if (!dev) return "postgresql://localhost:5432/sha_test?schema=public";

  const url = new URL(dev);
  url.pathname = "/sha_test";
  return url.toString();
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".nuxt/**", ".output/**", ".claude/**", "lib/generated/**"],
    // Тесты работают на отдельной базе: они её чистят, и рабочие данные
    // разработки не должны от этого страдать.
    env: {
      DATABASE_URL: testDatabaseUrl(),
      NODE_ENV: "test",
    },
    // Тесты пишут в общие таблицы, поэтому файлы не должны
    // выполняться параллельно и мешать друг другу.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      // Тот же корень, что и «~~» в Nuxt.
      "~~": path.resolve(import.meta.dirname),
      "~": path.resolve(import.meta.dirname, "app"),
    },
  },
});
