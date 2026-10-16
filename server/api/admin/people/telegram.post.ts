import { z } from "zod";

import { formatValue } from "~~/lib/applications/form";
import { db } from "~~/lib/db";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({ id: z.string().min(1), telegram: z.string().trim().max(64) });

/**
 * Ник Telegram организатора. Первый вход через Telegram или Mini App с этим
 * ником попадёт в его аккаунт (`upsertTelegramUser`). Пока Telegram не
 * привязан — ник можно поправить или стереть; привязанный — уже не нужен.
 */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "users.manage");
  const person = await db.user.findUnique({
    where: { id: body.id },
    select: { telegramId: true, telegramUsername: true, _count: { select: { roles: true } } },
  });
  if (!person) return { ok: false, message: "Человек не найден — обновите страницу." };
  if (person.telegramId) return { ok: false, message: "Telegram уже привязан — человек входит через него сам." };
  if (person._count.roles === 0) return { ok: false, message: "Ник для входа задают только организаторам — сначала выдайте роль." };

  let username: string | null = null;
  if (body.telegram) {
    const formatted = formatValue("TELEGRAM", body.telegram);
    if (!formatted.ok) return { ok: false, message: formatted.message };
    username = String(formatted.value).replace(/^@/, "");
    const taken = await db.user.findFirst({
      where: { id: { not: body.id }, telegramUsername: { equals: username, mode: "insensitive" }, roles: { some: {} } },
      select: { id: true },
    });
    if (taken) return { ok: false, message: `@${username} уже указан у другого организатора.` };
  }

  await db.user.update({ where: { id: body.id }, data: { telegramUsername: username } });
  await audit(event, {
    actorId: actor.id,
    action: "user.telegram",
    entityType: "user",
    entityId: body.id,
    meta: { from: person.telegramUsername, to: username },
  });
  return {
    ok: true,
    message: username ? `Готово: войдёт через Telegram @${username} — сразу в свой аккаунт.` : "Ник убран.",
  };
});
