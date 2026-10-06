import { db } from "~~/lib/db";
import { AVATAR_ERRORS, AVATAR_MAX_BYTES, deleteAvatarFiles, processAvatar } from "~~/lib/profile/avatar";
import { requireSignedIn } from "~~/server/utils/session";

/**
 * Своя аватарка. Мимо defineAction: multipart, как фото сайта и домашки.
 * Старый файл удаляем сразу — в uploads не копим.
 */
export default defineEventHandler(async (event) => {
  const user = await requireSignedIn(event).catch(() => null);
  if (!user) {
    setResponseStatus(event, 403);
    return { ok: false, message: "Нужно войти." };
  }

  const length = Number(getRequestHeader(event, "content-length") ?? 0);
  if (length > AVATAR_MAX_BYTES + 64 * 1024) return { ok: false, message: AVATAR_ERRORS.tooBig };

  const parts = (await readMultipartFormData(event)) ?? [];
  const file = parts.find((part) => part.name === "file" && part.data.length > 0);
  if (!file) return { ok: false, message: "Выберите фото." };

  const result = await processAvatar(file.data);
  if (!result.ok) return result;

  const previous = await db.user.findUnique({ where: { id: user.id }, select: { avatarKey: true } });
  await db.user.update({ where: { id: user.id }, data: { avatarKey: result.storageKey } });
  if (previous?.avatarKey) await deleteAvatarFiles(previous.avatarKey);
  return { ok: true, avatar: `/api/avatars/${result.storageKey}` };
});
