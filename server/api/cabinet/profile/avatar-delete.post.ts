import { z } from "zod";

import { db } from "~~/lib/db";
import { deleteAvatarFiles } from "~~/lib/profile/avatar";
import { requireSignedIn } from "~~/server/utils/session";

const schema = z.object({});

/** Убрать свою аватарку: снова заглушка с инициалами. */
export default defineAction(schema, async ({ event }) => {
  const user = await requireSignedIn(event);
  const previous = await db.user.findUnique({ where: { id: user.id }, select: { avatarKey: true } });
  if (!previous?.avatarKey) return { ok: true };
  await db.user.update({ where: { id: user.id }, data: { avatarKey: null } });
  await deleteAvatarFiles(previous.avatarKey);
  return { ok: true };
});
