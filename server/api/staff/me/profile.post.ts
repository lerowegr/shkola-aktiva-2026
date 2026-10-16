import { z } from "zod";

import { db } from "~~/lib/db";
import { requireSignedIn } from "~~/server/utils/session";

const NAME = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё' -]{0,59}$/;
const schema = z.object({ firstName: z.string().max(60), lastName: z.string().max(60) });

/** Как меня зовут — так видят кандидаты в сообщениях и коллеги в оценках. */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireSignedIn(event);
  if (!user.isStaff) return { ok: false, message: "Это для организаторов." };
  const firstName = body.firstName.trim().replace(/\s+/g, " ");
  const lastName = body.lastName.trim().replace(/\s+/g, " ");
  if (!firstName || !lastName) return { ok: false, message: "Укажите имя и фамилию." };
  if (!NAME.test(firstName) || !NAME.test(lastName)) return { ok: false, message: "Имя и фамилия — только буквы, пробел и дефис." };

  await db.user.update({ where: { id: user.id }, data: { firstName, lastName } });
  await audit(event, { actorId: user.id, action: "staff.profile", entityType: "user", entityId: user.id, meta: { firstName, lastName } });
  return { ok: true, message: "Сохранено." };
});
