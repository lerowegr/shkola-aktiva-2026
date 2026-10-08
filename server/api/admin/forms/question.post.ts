import { z } from "zod";

import { saveQuestion } from "~~/lib/admin/forms";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  id: z.string().min(1).optional(),
  section: z.string().max(60),
  type: z.enum(["SHORT_TEXT", "LONG_TEXT", "SINGLE_CHOICE", "MULTI_CHOICE", "URL"]),
  label: z.string().max(300),
  help: z.string().max(300).nullable(),
  required: z.boolean(),
  options: z.array(z.string().max(100)).max(20),
  maxLength: z.number().int().min(10).max(10000).nullable(),
  minLength: z.number().int().min(1).max(10000).nullable().optional(),
  format: z.enum(["DIGITS", "GROUP", "PHONE", "VK", "TELEGRAM"]).nullable().optional(),
});

export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "forms.manage");
  const result = await saveQuestion(await requireCurrentSeasonId(), body);
  if (!result.ok) return result;
  await audit(event, { actorId: actor.id, action: "form.question", entityType: "question", entityId: body.id, meta: { label: body.label, format: body.format ?? null, minLength: body.minLength ?? null } });
  return { ok: true, message: "Вопрос сохранён." };
});
