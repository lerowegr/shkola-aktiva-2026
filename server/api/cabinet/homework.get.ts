import { loadHomework } from "~~/lib/applications/homework";
import { requireUser } from "~~/server/utils/session";

/** Домашнее задание глазами кандидата. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return { homework: await loadHomework(user.id) };
});
