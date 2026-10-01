import { z } from "zod";

import { listAudit } from "~~/lib/admin/audit";
import { requirePermission } from "~~/server/utils/session";

const query = z.object({
  group: z.string().regex(/^[a-z_]+$/).optional(),
  before: z.string().datetime({ offset: true }).optional(),
});

export default defineEventHandler(async (event) => {
  await requirePermission(event, "audit.view");
  const params = query.parse(getQuery(event));
  return listAudit({ group: params.group, before: params.before ? new Date(params.before) : undefined });
});
