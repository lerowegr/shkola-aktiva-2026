import { z } from "zod";

import { requestEmailCode } from "~~/lib/auth/email-code";

const schema = z.object({
  email: z.email("Проверьте адрес почты — в нём ошибка."),
});

/** Первый шаг входа по почте: выслать код. */
export default defineAction(schema, async ({ body }) => {
  const result = await requestEmailCode(body.email);

  if (!result.ok) {
    return {
      ok: false,
      message: "Код уже отправлен недавно. Проверьте почту и папку «Спам» или подождите минуту.",
    };
  }

  return { ok: true, message: "Отправили код на почту." };
});
