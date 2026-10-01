import { z } from "zod";

import { createInvite } from "~~/lib/auth/invite";
import { db } from "~~/lib/db";
import { requirePermission } from "~~/server/utils/session";

/** Новая ссылка, чтобы человек сам задал пароль. Старые при этом гаснут. */
export default defineAction(z.object({ userId: z.string().min(1) }), async ({ body, event }) => {
  const actor = await requirePermission(event, "users.manage");
  const user = await db.user.findUnique({ where: { id: body.userId }, select: { email: true, status: true } });
  if (!user?.email) return { ok: false, message: "У человека нет почты — пароль ему не нужен, он входит через Telegram." };
  if (user.status === "BLOCKED") return { ok: false, message: "Человек заблокирован." };

  const { token } = await createInvite(body.userId, actor.id);
  await audit(event, { actorId: actor.id, action: "invite.create", entityType: "user", entityId: body.userId });
  const appUrl = (process.env.NUXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return { ok: true, link: `${appUrl}/invite/${token}` };
});
