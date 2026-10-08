import { z } from "zod";

import { normalizeEmail } from "~~/lib/auth/email";
import { createInvite } from "~~/lib/auth/invite";
import { db } from "~~/lib/db";
import { canGrantRole } from "~~/lib/permissions";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  email: z.email("Проверьте адрес почты — в нём ошибка."),
  firstName: z.string().trim().min(1, "Укажите имя.").max(60),
  lastName: z.string().trim().max(60).optional(),
  roleId: z.string().min(1, "Выберите роль."),
});

/**
 * Пригласить организатора.
 *
 * Заводит человека (или находит по почте — например, он уже был
 * кандидатом), выдаёт роль и возвращает личную ссылку, по которой он сам
 * задаст пароль. Ссылку пригласивший пересылает лично.
 */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "users.manage");

  const role = await db.role.findUnique({
    where: { id: body.roleId },
    select: { id: true, name: true, permissions: true },
  });
  if (!role) return { ok: false, message: "Такой роли нет — обновите страницу." };

  // Выдать можно только роль, все права которой есть у самого выдающего.
  if (!canGrantRole(actor, role.permissions)) {
    return { ok: false, message: `Роль «${role.name}» сильнее ваших прав — её выдаёт тех.админ.` };
  }

  const email = normalizeEmail(body.email);

  const user = await db.user.upsert({
    where: { email },
    create: { email, firstName: body.firstName, lastName: body.lastName ?? null },
    update: {},
    select: { id: true, status: true },
  });

  if (user.status === "BLOCKED") {
    return { ok: false, message: "Этот человек заблокирован. Сначала снимите блокировку." };
  }

  await db.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: role.id } },
    create: { userId: user.id, roleId: role.id, assignedById: actor.id },
    update: {},
  });

  const { token } = await createInvite(user.id, actor.id);

  await audit(event, {
    actorId: actor.id,
    action: "invite.create",
    entityType: "user",
    entityId: user.id,
    meta: { roleId: role.id, roleName: role.name },
  });

  const appUrl = (process.env.NUXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

  return { ok: true, message: "Приглашение готово.", link: `${appUrl}/invite/${token}` };
});
