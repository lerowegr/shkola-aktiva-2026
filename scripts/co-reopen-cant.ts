/**
 * Центр оценки: снова спросить ответивших «не смогу». Нужен, когда у них не
 * было выбора — до появления резервного дня и выбора другого времени.
 * Ответ сбрасывается на «не ответил», человеку приходит уведомление: в
 * кабинете он выберет другое время своего факультета, резервный день или
 * снова «не смогу».
 *
 * Без --apply только показывает, кого затронет. Только ещё не начавшиеся сборы.
 * --silent — заодно и тех, кто ещё не ответил: им то же «выберите время».
 * --queued — и тех, кто в очереди на резервный день: ответ не трогаем, только
 *            подсказываем, что можно выбрать время (свой текст).
 * --urgent — в Telegram сразу, даже ночью (иначе ночью ждёт 08:00).
 *
 *   на сервере: ./deploy/dc.sh run --rm -T migrate npx tsx scripts/co-reopen-cant.ts
 *               ./deploy/dc.sh run --rm -T migrate npx tsx scripts/co-reopen-cant.ts --apply
 */
import { db } from "../lib/db";
import { notify } from "../lib/notifications/notify";

const MSK = new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

async function main() {
  const apply = process.argv.includes("--apply");
  const urgent = process.argv.includes("--urgent");
  const silent = process.argv.includes("--silent");
  const queued = process.argv.includes("--queued");
  const now = new Date();

  const invites = await db.assessmentInvite.findMany({
    where: {
      OR: [
        { answer: "CANT" as const },
        ...(silent ? [{ answer: null, reserveQueued: false }] : []),
        ...(queued ? [{ answer: "RESERVE" as const, reserveQueued: true }] : []),
      ],
      session: { reserve: false, startsAt: { gt: now }, season: { isCurrent: true } },
      application: { status: "SUBMITTED" },
    },
    select: {
      id: true,
      answer: true,
      reserveQueued: true,
      session: { select: { title: true, startsAt: true } },
      application: { select: { userId: true, lastName: true, firstName: true } },
    },
    orderBy: { session: { startsAt: "asc" } },
  });

  const cant = invites.filter((invite) => invite.answer === "CANT").length;
  const inQueue = invites.filter((invite) => invite.reserveQueued).length;
  console.log(`На ещё не начавшиеся сборы: «не смогу» — ${cant}, в очереди на резерв — ${inQueue}, не ответили — ${invites.length - cant - inQueue}`);
  for (const invite of invites) {
    const name = [invite.application.lastName, invite.application.firstName].filter(Boolean).join(" ") || "без имени";
    console.log(`  ${invite.answer === "CANT" ? "не смогу " : invite.reserveQueued ? "очередь  " : "молчит   "} ${name} — ${invite.session.title} (${MSK.format(invite.session.startsAt)} МСК)`);
  }
  if (!apply) {
    console.log("\nЭто проверка. Чтобы сбросить ответы и разослать уведомления — добавьте --apply.");
    return;
  }

  await db.assessmentInvite.updateMany({
    where: { id: { in: invites.filter((invite) => invite.answer === "CANT").map((invite) => invite.id) }, answer: "CANT" },
    data: { answer: null, answeredAt: null, reserveQueued: false },
  });
  const sent = await notify(
    invites.map((invite) => ({
      userId: invite.application.userId,
      category: "SELECTION" as const,
      ...(invite.reserveQueued
        ? {
            title: "Центр оценки: можно выбрать время",
            body:
              "Вы в очереди на резервный день. Если вам подходит одно из времён для вашего факультета — выберите его в кабинете, места ограничены. " +
              "Если не подходит — ничего делать не нужно, вы остаётесь в очереди.",
          }
        : {
            title: "Центр оценки: выберите время",
            body:
        "Для вашего факультета есть несколько времён на выбор, а если ни одно не подходит — резервный день. " +
        "Места ограничены: кто раньше выбрал, за тем и место. Откройте кабинет и выберите, что подходит. «Не получится» — только если не подходит ничего.",
          }),
      url: "/cabinet/assessment",
      key: `assessment-reopen:${invite.id}`,
    })),
    { urgent },
  );
  console.log(`\nОтветы «не смогу» сброшены: ${cant}. Уведомлений создано: ${sent}${urgent ? " (срочно)" : " (ночью — в Telegram к 08:00)"}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
