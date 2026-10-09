import { loadOnboarding } from "~~/lib/profile/onboarding-store";
import { requireUser } from "~~/server/utils/session";

/** Знакомство: что уже известно о человеке — подставить в форму. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return loadOnboarding(user.id);
});
