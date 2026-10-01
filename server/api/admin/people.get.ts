import { z } from "zod";

import { searchPeople } from "~~/lib/admin/people";
import { requirePermission } from "~~/server/utils/session";

const query = z.object({ q: z.string().max(100).default(""), scope: z.enum(["staff", "all"]).default("staff") });

export default defineEventHandler(async (event) => {
  await requirePermission(event, "users.manage");
  const params = query.parse(getQuery(event));
  return { people: await searchPeople({ query: params.q, scope: params.scope }) };
});
