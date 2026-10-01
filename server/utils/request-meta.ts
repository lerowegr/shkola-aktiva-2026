import type { AppEvent } from "~~/server/utils/session";

/** IP и браузер для журнала — для ядра, которое не знает про заголовки. */
export function requestMeta(event: AppEvent) {
  const forwarded = getRequestHeader(event, "x-forwarded-for");
  return {
    ip: forwarded?.split(",")[0]?.trim() ?? getRequestIP(event) ?? null,
    userAgent: getRequestHeader(event, "user-agent") ?? null,
  };
}
