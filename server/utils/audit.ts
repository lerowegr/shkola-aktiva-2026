import { writeAudit } from "~~/lib/audit";
import type { AppEvent } from "~~/server/utils/session";

/**
 * Запись в журнал вместе с тем, откуда пришёл запрос.
 *
 * Ядро про заголовки не знает и знать не должно, поэтому адрес и браузер
 * достаём здесь и передаём внутрь.
 */
export function audit(
  event: AppEvent,
  params: Parameters<typeof writeAudit>[0],
): Promise<void> {
  const forwarded = getRequestHeader(event, "x-forwarded-for");

  return writeAudit({
    ...params,
    ip: forwarded?.split(",")[0]?.trim() ?? getRequestIP(event) ?? null,
    userAgent: getRequestHeader(event, "user-agent") ?? null,
  });
}
