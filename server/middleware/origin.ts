import { isTrustedOrigin } from "~~/lib/auth/origin";

/**
 * Запрос с чужого сайта не меняет данные.
 *
 * Здесь, а не в defineAction, по простой причине: обработчики, принимающие
 * файлы (домашние задания, фотографии), идут мимо общего договора действий,
 * потому что в JSON файл не завернёшь.
 * Забыть добавить проверку в такой обработчик легко, и заметно это станет
 * не сразу. Middleware видит все запросы и забыть о себе не даёт.
 *
 * Читающие запросы пропускаем: подделка GET-а ничего не меняет, а под
 * проверку попали бы все страницы сайта разом.
 */
export default defineEventHandler((event) => {
  const method = event.method;
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return;

  /*
   * Свой адрес берём из настроек, а не только из заголовка запроса.
   *
   * До приложения запрос доходит через общий nginx, и каким там окажется
   * Host — вопрос чужой настройки. Адрес сайта при этом известен точно:
   * по нему же решается, какое имя у куки сессии.
   */
  const allowed = [
    process.env.NUXT_PUBLIC_APP_URL,
    getRequestHost(event, { xForwardedHost: true }),
  ];

  if (isTrustedOrigin(getHeader(event, "origin"), allowed)) return;

  throw createError({
    statusCode: 403,
    statusMessage: "Запрос пришёл с чужого сайта и отклонён.",
  });
});
