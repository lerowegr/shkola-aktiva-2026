/**
 * Центр оценки: снова спросить ответивших «не смогу». Нужен, когда у них не
 * было выбора — до появления резервного дня и выбора другого времени.
 * Ответ сбрасывается на «не ответил», человеку приходит уведомление: в
 * кабинете он выберет другое время своего факультета, резервный день или
 * снова «не смогу».
 *
 * Без --apply только показывает, кого затронет. Только ещё не начавшиеся сборы.
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
  const now = new Date();

  const invites = await db.assessmentInvite.findMany({
    where: {
      answer: "CANT",
      session: { reserve: false, startsAt: { gt: now }, season: { isCurrent: true } },
      application: { status: "SUBMITTED" },
    },
    select: {
      id: true,
      session: { select: { title: true, startsAt: true } },
      application: { select: { userId: true, lastName: true, firstName: true } },
    },
    orderBy: { session: { startsAt: "asc" } },
  });

  console.log(`Ответили «не смогу» на ещё не начавшиеся сборы: ${invites.length}`);
  for (const invite of invites) {
    const name = [invite.application.lastName, invite.application.firstName].filter(Boolean).join(" ") || "без имени";
    console.log(`  ${name} — ${invite.session.title} (${MSK.format(invite.session.startsAt)} МСК)`);
  }
  if (!apply) {
    console.log("\nЭто проверка. Чтобы сбросить ответы и разослать уведомления — добавьте --apply.");
    return;
  }

  await db.assessmentInvite.updateMany({
    where: { id: { in: invites.map((invite) => invite.id) }, answer: "CANT" },
    data: { answer: null, answeredAt: null, reserveQueued: false },
  });
  const sent = await notify(
    invites.map((invite) => ({
      userId: invite.application.userId,
      category: "SELECTION" as const,
      title: "Центр оценки: появилось другое время и резервный день",
      body:
        "Раньше в ответе на приглашение был только один вариант времени. Теперь можно выбрать другое время для вашего факультета или записаться на резервный день. " +
        "Откройте кабинет и выберите, что подходит. «Не получится» — только если не подходит ничего.",
      url: "/cabinet/assessment",
      key: `assessment-reopen:${invite.id}`,
    })),
    { urgent },
  );
  console.log(`\nОтветы сброшены: ${invites.length}. Уведомлений создано: ${sent}${urgent ? " (срочно)" : " (ночью — в Telegram к 08:00)"}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
