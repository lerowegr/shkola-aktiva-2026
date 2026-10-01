import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "~~/lib/generated/prisma/client";

/**
 * Единственный экземпляр клиента базы на процесс.
 *
 * В разработке Nuxt перезагружает серверные модули при каждой правке. Без
 * кеша на globalThis каждая перезагрузка создавала бы новый пул соединений,
 * и через десяток правок Postgres начал бы отказывать в подключении.
 *
 * Осторожно: после изменения схемы сервер разработки держит в памяти старый
 * сгенерированный клиент и падает с «Unknown field». Помогает только
 * перезапуск `npm run dev`.
 */
function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "Не задана переменная DATABASE_URL. Скопируйте .env.example в .env и заполните её.",
    );
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma?: ReturnType<typeof createPrismaClient>;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
