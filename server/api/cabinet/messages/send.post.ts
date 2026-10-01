import { z } from "zod";

import { MESSAGE_MAX, postMessage, threadFor } from "~~/lib/messages/threads";
import { requireCurrentSeasonId } from "~~/server/utils/season";
import { requireSignedIn } from "~~/server/utils/session";

const schema = z.object({
  text: z.string().trim().min(1, "Напишите сообщение.").max(MESSAGE_MAX, `Не длиннее ${MESSAGE_MAX} знаков.`),
});

/** Кандидат пишет организаторам с сайта. */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireSignedIn(event);
  const thread = await threadFor(await requireCurrentSeasonId(), user.id);
  await postMessage({ threadId: thread.id, author: "CANDIDATE", authorId: user.id, text: body.text, via: "SITE" });
  return { ok: true };
});
