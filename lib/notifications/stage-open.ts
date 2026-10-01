import { db } from "~~/lib/db";
import { notify } from "~~/lib/notifications/notify";
import { stageState } from "~~/lib/stages";

/**
 * «Анкета открылась» — тем, кто зарегистрировался заранее.
 *
 * Пока анкета закрыта, сайт зовёт «Зарегистрироваться» и обещает написать,
 * когда она откроется. Это обещание держит разносчик: раз в минуту смотрит,
 * открыт ли этап, и досоздаёт уведомления. Ключ stage-open:<этап> не даёт
 * прислать второе.
 *
 * Кому: кандидатам (без ролей, не владельцу, с открытым доступом), которые
 * пришли до открытия и ещё не начали анкету. Кто пришёл позже, анкету
 * увидит сам — «анкета открылась» через минуту после входа звучит странно.
 * Момент открытия — дата этапа, а если этап открыли вручную раньше даты,
 * то время этого переключения.
 */
export async function materializeStageOpen(now = new Date()): Promise<number> {
  const stage = await db.stage.findFirst({
    where: { kind: "APPLICATION", season: { isCurrent: true } },
    select: { id: true, seasonId: true, mode: true, opensAt: true, closesAt: true, updatedAt: true },
  });
  if (!stage || stageState(stage, now) !== "open") return 0;

  const openedAt = stage.opensAt && stage.opensAt <= now ? stage.opensAt : stage.updatedAt;
  const key = `stage-open:${stage.id}`;

  const users = await db.user.findMany({
    where: {
      status: "ACTIVE",
      isOwner: false,
      roles: { none: {} },
      createdAt: { lt: openedAt },
      applications: { none: { seasonId: stage.seasonId } },
      notifications: { none: { key } },
    },
    select: { id: true },
  });

  const until = stage.closesAt
    ? new Intl.DateTimeFormat("ru-RU", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Moscow",
      }).format(stage.closesAt)
    : null;

  return notify(
    users.map((user) => ({
      userId: user.id,
      category: "SELECTION" as const,
      title: "Анкета открылась",
      body: until ? `Заполнить и отправить можно до ${until} по Москве.` : "Заполните её в кабинете.",
      url: "/cabinet/application",
      key,
    })),
    { now },
  );
}
