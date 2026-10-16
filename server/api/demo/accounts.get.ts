import { DEMO_DOMAIN, demoAccounts } from "~~/lib/demo/scenario";
import { db } from "~~/lib/db";

/** Демо: кем можно войти — организаторы и кандидаты на разных этапах. */
export default defineEventHandler(async (event) => {
  requireDemo(event);
  const people = await db.user.findMany({
    where: { email: { endsWith: `@${DEMO_DOMAIN}` } },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  return { accounts: demoAccounts(people) };
});
