import { readInbox } from "~~/lib/notifications/inbox";
import { requireUser } from "~~/server/utils/session";

/** Колокольчик: последние уведомления и сколько непрочитанных. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return readInbox(user.id);
});
