import { z } from "zod";

import { requirePermission } from "~~/server/utils/session";

const schema = z.object({});

/** Публикация итогов временно закрыта, в том числе для прямого запроса. */
export default defineAction(schema, async ({ event }) => {
  await requirePermission(event, "applications.decide");
  return { ok: false, message: "Публикация итогов временно отключена. Решения остаются черновиками." };
});
