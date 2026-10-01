import { z } from "zod";

import { reassignApplication } from "~~/lib/applications/assign";
import { notifyAssigned } from "~~/lib/applications/notifications";
import { EVALUATED_STAGES } from "~~/lib/applications/staff";
import { db } from "~~/lib/db";
import { requirePermission } from "~~/server/utils/session";

const schema = z.object({
  applicationId: z.string().min(1),
  reviewerId: z.string().min(1),
  stage: z.enum(EVALUATED_STAGES).default("APPLICATION"),
});

/** Передать анкету другому мастеру — вместе с уже поставленными баллами. */
export default defineAction(schema, async ({ body, event }) => {
  const actor = await requirePermission(event, "applications.assign");

  const reviewer = await db.user.findFirst({
    where: {
      id: body.reviewerId,
      status: "ACTIVE",
      roles: { some: { role: { permissions: { has: "applications.review" } } } },
    },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!reviewer) return { ok: false, message: "Этот человек не мастер отбора — выберите другого." };

  const application = await db.application.findFirst({
    where: { id: body.applicationId, status: "SUBMITTED" },
    select: { id: true },
  });
  if (!application) return { ok: false, message: "Анкета не найдена." };

  const review = await reassignApplication(application.id, body.stage, reviewer.id);

  await audit(event, {
    actorId: actor.id,
    action: "application.reassign",
    entityType: "application",
    entityId: application.id,
    meta: { stage: body.stage, reviewerId: reviewer.id, reviewer: [reviewer.firstName, reviewer.lastName].filter(Boolean).join(" ") },
  });

  await notifyAssigned([review.id], body.stage);

  return { ok: true, message: "Анкета передана.", reviewId: review.id };
});
