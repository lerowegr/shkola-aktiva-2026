import { db } from "~~/lib/db";
import { canAny } from "~~/lib/permissions";
import { readUpload } from "~~/lib/uploads";
import { requireUser } from "~~/server/utils/session";

/**
 * Отдать загруженный файл — домашнее задание.
 *
 * Только владельцу и организаторам, которые проверяют работы. Отдаём с
 * заголовками, которые не дают браузеру угадывать тип и кешировать
 * чужую работу на общем компьютере.
 */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const id = getRouterParam(event, "id") ?? "";

  const meta = await db.upload.findUnique({ where: { id }, select: { userId: true } });
  const allowed = meta && (meta.userId === user.id || canAny(user, ["applications.review", "applications.view_all"]));
  if (!allowed) throw createError({ statusCode: 404, statusMessage: "Файл не найден." });

  const file = await readUpload(id);
  if (!file) throw createError({ statusCode: 404, statusMessage: "Файл не найден." });

  setResponseHeaders(event, {
    "Content-Type": file.upload.mime,
    "Content-Length": String(file.data.length),
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.upload.filename)}`,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
  });

  return file.data;
});
