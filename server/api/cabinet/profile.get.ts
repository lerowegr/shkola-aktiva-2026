import { db } from "~~/lib/db";
import { displayName } from "~~/lib/profile/display";
import { requireUser } from "~~/server/utils/session";

/** Свой профиль для рейтинга: ник, аватарка, как видят другие. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const profile = await db.user.findUnique({
    where: { id: user.id },
    select: { nickname: true, seq: true, avatarKey: true, nicknameChangedAt: true },
  });
  if (!profile) throw createError({ statusCode: 401, statusMessage: "Нужно войти." });
  return {
    nickname: profile.nickname,
    avatar: profile.avatarKey ? `/api/avatars/${profile.avatarKey}` : null,
    displayName: displayName({ nickname: profile.nickname, seq: profile.seq }),
    nicknameChangedAt: profile.nicknameChangedAt,
  };
});
