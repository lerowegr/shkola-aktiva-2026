import { z } from "zod";

import { resetDemo } from "~~/lib/demo/scenario";

/** Демо: вернуть всё в исходное состояние. Сессия сбросившего тоже кончится. */
export default defineAction(z.object({}), async ({ event }) => {
  requireDemo(event);
  const result = await resetDemo();
  return { ok: true, message: `Демо пересоздано: организаторов ${result.staff}, кандидатов ${result.candidates}.` };
});
