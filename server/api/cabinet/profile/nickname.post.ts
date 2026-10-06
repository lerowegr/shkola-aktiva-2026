import { z } from "zod";

import { setNickname } from "~~/lib/profile/nickname";
import { requireSignedIn } from "~~/server/utils/session";

const schema = z.object({ nickname: z.string().max(40) });

/** Свой ник. Аудита нет: меняет кандидат, не организатор. */
export default defineAction(schema, async ({ body, event }) => {
  const user = await requireSignedIn(event);
  return setNickname(user.id, body.nickname);
});
