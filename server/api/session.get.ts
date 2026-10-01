import { currentUser } from "~~/server/utils/session";

/** Кто я. Страницы спрашивают это при загрузке, чтобы решить, что показать. */
export default defineEventHandler(async (event) => {
  return { user: await currentUser(event) };
});
