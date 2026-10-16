import { z } from "zod";

import { deleteCheck } from "~~/lib/admin/people";
import { requirePermission } from "~~/server/utils/session";

/** Перед удалением: сколько работы у организатора — передавать ли её. */
export default defineEventHandler(async (event) => {
  await requirePermission(event, "users.manage");
  await requirePermission(event, "roles.manage");
  const { userId } = z.object({ userId: z.string().min(1) }).parse(getQuery(event));
  const check = await deleteCheck(userId);
  if (!check) throw createError({ statusCode: 404, statusMessage: "Человек не найден." });
  return check;
});
