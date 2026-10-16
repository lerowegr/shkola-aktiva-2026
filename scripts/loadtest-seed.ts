/**
 * Тестовые люди для нагрузочного теста (tools/loadtest).
 *
 * Заводит N кандидатов и M организаторов с почтой @loadtest.local и сразу
 * выдаёт им сессии — регистрация на сайте идёт через Telegram, его не
 * сымитировать. Двери «войти без Telegram» в коде сайта нет: сессии
 * появляются только так, прямо в базе, и живут 3 часа.
 *
 * Кандидаты — как только что пришедшие из Telegram: без знакомства, его
 * пройдёт сам тест (с хешированием пароля — самой тяжёлой частью). Организаторы
 * — роль «Нагрузочный тест» только с просмотром анкет: оценивать и
 * распределять они не могут, настоящим кандидатам ничего не приходит.
 *
 * Печатает JSON с токенами сессий: {"origin": …, "candidates": [...], "staff": [...]}.
 * Убрать всё — scripts/loadtest-clean.ts.
 *
 *   npx tsx scripts/loadtest-seed.ts --candidates 2000 --staff 20 > tokens.json
 *   --open-application — открыть приём анкет на неделю (только локальная база)
 */
import { randomBytes } from "node:crypto";

import { db } from "../lib/db";

const LOADTEST_DOMAIN = "loadtest.local";
const SESSION_HOURS = 3;

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? Number(process.argv[index + 1]) : fallback;
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name}: нужно целое число`);
  return value;
}

async function main() {
  const candidates = arg("candidates", 1000);
  const staff = arg("staff", 20);
  if (candidates > 30_000 || staff > 200) throw new Error("Слишком много: до 30 000 кандидатов и 200 организаторов.");

  const run = randomBytes(3).toString("hex");
  const expires = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);

  if (process.argv.includes("--open-application")) {
    const url = process.env.DATABASE_URL ?? "";
    if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("--open-application — только для локальной базы.");
    const season = await db.season.findFirstOrThrow({ where: { isCurrent: true }, select: { id: true } });
    await db.stage.updateMany({
      where: { seasonId: season.id, kind: "APPLICATION" },
      data: { mode: "AUTO", opensAt: new Date(Date.now() - 24 * 3600_000), closesAt: new Date(Date.now() + 7 * 24 * 3600_000) },
    });
  }

  const role = await db.role.upsert({
    where: { slug: "loadtest" },
    create: {
      slug: "loadtest",
      name: "Нагрузочный тест",
      description: "Тестовые организаторы @loadtest.local — только просмотр. Убираются scripts/loadtest-clean.ts.",
      permissions: ["applications.view_all"],
    },
    update: { permissions: ["applications.view_all"] },
    select: { id: true },
  });

  async function make(kind: "c" | "s", count: number): Promise<string[]> {
    const tokens: string[] = [];
    const BATCH = 500;
    for (let start = 0; start < count; start += BATCH) {
      const size = Math.min(BATCH, count - start);
      const rows = Array.from({ length: size }, (_, i) => ({
        id: `lt${run}${kind}${String(start + i).padStart(5, "0")}`,
        email: `lt-${run}-${kind}${start + i}@${LOADTEST_DOMAIN}`,
        firstName: kind === "c" ? "Нагрузка" : "Оргнагрузка",
        lastName: `Тест${start + i}`,
      }));
      await db.user.createMany({ data: rows });
      if (kind === "s") {
        await db.userRole.createMany({ data: rows.map((row) => ({ userId: row.id, roleId: role.id })) });
      }
      const sessions = rows.map((row) => ({ sessionToken: randomBytes(32).toString("base64url"), userId: row.id, expires }));
      await db.session.createMany({ data: sessions });
      tokens.push(...sessions.map((session) => session.sessionToken));
    }
    return tokens;
  }

  const result = { run, candidates: await make("c", candidates), staff: await make("s", staff) };
  await db.auditLog.create({ data: { action: "loadtest.seed", meta: { run, candidates, staff } } });
  process.stdout.write(JSON.stringify(result));
  console.error(`Заведено: кандидатов ${candidates}, организаторов ${staff}. Сессии живут ${SESSION_HOURS} ч.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
