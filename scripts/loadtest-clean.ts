/**
 * Убрать всё, что оставил нагрузочный тест: людей @loadtest.local (их
 * сессии, анкеты, ответы, оценки уходят каскадом), записи журнала от их
 * имени, роль «Нагрузочный тест» и просроченные коды входа (живые не
 * трогаем — ими прямо сейчас может входить настоящий человек).
 *
 *   npx tsx scripts/loadtest-clean.ts
 */
import { db } from "../lib/db";

const DOMAIN = "loadtest.local";

async function main() {
  const users = await db.user.findMany({ where: { email: { endsWith: `@${DOMAIN}` } }, select: { id: true } });
  const ids = users.map((user) => user.id);

  let removed = 0;
  const BATCH = 1000;
  for (let start = 0; start < ids.length; start += BATCH) {
    const chunk = ids.slice(start, start + BATCH);
    await db.auditLog.deleteMany({ where: { actorId: { in: chunk } } });
    removed += (await db.user.deleteMany({ where: { id: { in: chunk } } })).count;
  }
  await db.role.deleteMany({ where: { slug: "loadtest" } });
  // Коды входа, которые тест брал и не подтверждал, живут 5 минут.
  const codes = await db.telegramLoginCode.deleteMany({ where: { expiresAt: { lt: new Date() } } });

  await db.auditLog.create({ data: { action: "loadtest.clean", meta: { users: removed, codes: codes.count } } });
  console.log(`Убрано: людей ${removed}, просроченных кодов входа ${codes.count}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
