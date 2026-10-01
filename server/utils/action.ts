import type { ZodType } from "zod";

import { ForbiddenError } from "~~/lib/auth/actor";
import type { AppEvent } from "~~/server/utils/session";

/**
 * Обёртка для всего, что меняет данные.
 *
 * Маршрут можно дёрнуть напрямую, минуя интерфейс. Поэтому правило одно и
 * записано в одном месте: сначала разбор тела через zod, дальше внутри
 * обработчика обязательная проверка права, и только потом действие.
 *
 * Обёртка берёт на себя три скучные вещи, чтобы их не забывали:
 * читает и проверяет тело, переводит отказ в прав в честный 403 с русским
 * текстом, и не даёт внутренней ошибке утечь наружу подробностями.
 */
export interface ActionResult {
  ok: boolean;
  message?: string;
}

export function defineAction<TBody, TResult extends ActionResult>(
  schema: ZodType<TBody>,
  handler: (context: { body: TBody; event: AppEvent }) => Promise<TResult>,
) {
  return defineEventHandler(async (event) => {
    const raw = await readBody(event).catch(() => ({}));
    const parsed = schema.safeParse(raw);

    if (!parsed.success) {
      return {
        ok: false,
        message: parsed.error.issues[0]?.message ?? "Проверьте поля",
      } satisfies ActionResult;
    }

    try {
      return await handler({ body: parsed.data, event });
    } catch (error) {
      if (error instanceof ForbiddenError) {
        setResponseStatus(event, 403);
        return { ok: false, message: error.message } satisfies ActionResult;
      }

      // Наружу подробности не отдаём: в них бывают куски запросов к базе.
      console.error("Ошибка в действии", error);
      setResponseStatus(event, 500);
      return {
        ok: false,
        message: "Не получилось. Попробуйте ещё раз или обновите страницу.",
      } satisfies ActionResult;
    }
  });
}
