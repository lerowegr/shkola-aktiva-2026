import { submitHomework } from "~~/lib/applications/homework";
import { MAX_UPLOAD_BYTES } from "~~/lib/uploads";
import { requireSignedIn } from "~~/server/utils/session";

/**
 * Сдать домашнее задание: PDF и/или текст.
 *
 * Мимо defineAction: файл в JSON не завернёшь, приходит multipart.
 * Защиту от чужих сайтов держит общий middleware, права — здесь.
 */
export default defineEventHandler(async (event) => {
  const user = await requireSignedIn(event).catch(() => null);
  if (!user) {
    setResponseStatus(event, 403);
    return { ok: false, message: "Нужно войти." };
  }

  // Отказываем до чтения тела: не тянуть в память лишние мегабайты.
  const length = Number(getRequestHeader(event, "content-length") ?? 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return { ok: false, message: "Файл больше 20 МБ. Сожмите PDF или уберите лишние картинки." };
  }

  const parts = (await readMultipartFormData(event)) ?? [];
  const filePart = parts.find((part) => part.name === "file" && part.filename && part.data.length > 0);
  const textPart = parts.find((part) => part.name === "text");

  return submitHomework({
    userId: user.id,
    file: filePart ? { filename: filePart.filename!, data: filePart.data } : null,
    text: textPart ? textPart.data.toString("utf8") : null,
    via: "SITE",
  });
});
