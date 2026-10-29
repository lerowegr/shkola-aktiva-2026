import { db } from "~~/lib/db";

/**
 * Журнал действий.
 *
 * Пишется при каждом изменении данных. Нужен не «для галочки»: организаторы
 * решают судьбу кандидатов и меняют права, и однажды обязательно возникнет
 * спор о том, кто что сделал. Без записи ответа не будет.
 *
 * Откуда пришёл запрос, этот файл не выясняет сам: он не знает ни про
 * сервер, ни про заголовки. Адрес и браузер передаёт вызывающий — на
 * стороне обработчика для этого есть audit(), который берёт их из события.
 */
export async function writeAudit(params: {
  actorId: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
  /** Откуда пришёл запрос. Для фоновых задач не заполняется — это нормально. */
  ip?: string | null;
  userAgent?: string | null;
}, client: Pick<typeof db, "auditLog"> = db): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: params.actorId,
      action: params.action,
      entityType: params.entityType ?? null,
      entityId: params.entityId ?? null,
      meta: params.meta ? JSON.parse(JSON.stringify(params.meta)) : undefined,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}
