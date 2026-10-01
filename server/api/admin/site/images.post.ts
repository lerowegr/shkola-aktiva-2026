import { db } from "~~/lib/db";
import { IMAGE_ERRORS, MAX_IMAGE_BYTES, processImage } from "~~/lib/site/images";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

/**
 * Загрузить фото для сайта (люди, место, история).
 *
 * Мимо defineAction: файл в JSON не завернёшь, приходит multipart — как у
 * домашних заданий. Защиту от чужих сайтов держит общий middleware, право —
 * первой строкой здесь. Фото без ссылок из текстов уберутся при сохранении.
 */
export default defineEventHandler(async (event) => {
  const actor = await requirePermission(event, "content.manage").catch(() => null);
  if (!actor) {
    setResponseStatus(event, 403);
    return { ok: false, message: "Загружать фото сайта может только тот, кто правит тексты сайта." };
  }

  // Отказываем до чтения тела: не тянуть в память лишние мегабайты.
  const length = Number(getRequestHeader(event, "content-length") ?? 0);
  if (length > MAX_IMAGE_BYTES + 64 * 1024) return { ok: false, message: IMAGE_ERRORS.tooBig };

  const parts = (await readMultipartFormData(event)) ?? [];
  const file = parts.find((part) => part.name === "file" && part.data.length > 0);
  if (!file) return { ok: false, message: "Выберите фото." };

  const result = await processImage(file.data);
  if (!result.ok) return result;

  const image = await db.siteImage.create({
    data: {
      seasonId: await requireCurrentSeasonId(),
      storageKey: result.storageKey,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      createdById: actor.id,
    },
    select: { id: true, width: true, height: true },
  });

  await audit(event, {
    actorId: actor.id,
    action: "content.image_upload",
    entityType: "site_image",
    entityId: image.id,
    meta: { width: image.width, height: image.height },
  });

  return { ok: true, image };
});
