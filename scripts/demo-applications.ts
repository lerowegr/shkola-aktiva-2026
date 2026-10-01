/**
 * Демо-данные для кабинета мастера: кандидаты с отправленными анкетами,
 * второй мастер и несколько уже проверенных анкет.
 *
 * Только для разработки: на боевой базе скрипт отказывается работать.
 * Демо-люди заводятся с почтами @demo.local — их легко найти и удалить.
 * Повторный запуск ничего не дублирует.
 *
 * Запуск: npm run db:demo
 */
import { assignApplication } from "../lib/applications/assign";
import { db } from "../lib/db";
import type { Prisma } from "../lib/generated/prisma/client";
import { DEFAULT_CONTENT, type SiteContent } from "../lib/site/content";

if (process.env.NODE_ENV === "production") {
  console.error("Демо-данные на боевой базе не создаются.");
  process.exit(1);
}

const CANDIDATES = [
  ["Смирнова", "Алина", "Олеговна", "alina_sm", "Очная", "1 курс"],
  ["Петрова", "Нина", "Сергеевна", "nina_three", "Очная", "2 курс"],
  ["Юсупова", "Амина", "Рустамовна", "amina_yu", "Очная", "1 курс"],
  ["Белов", "Артём", "Сергеевич", "artem_belov", "Очно-заочная", "3 курс"],
  ["Лебедева", "Полина", "Андреевна", "polina_leb", "Очная", "1 курс"],
  ["Григорьев", "Максим", "Павлович", "max_grig", "Очная", "2 курс"],
  ["Орехова", "Софья", "Денисовна", "sonya_or", "Очная", "1 курс"],
  ["Фомина", "Дарья", "Ильинична", "dasha_fom", "Заочная", "4 курс"],
] as const;

// По порядку длинных вопросов анкеты: стороны, хобби, занятость, опыт,
// навыки, почему, что получить.
const LONG_ANSWERS = [
  "Сильные стороны: ответственность, умею слушать, быстро учусь. Слабые: перфекционизм, иногда затягиваю с решениями, не люблю просить помощи. Стараюсь делить задачи на шаги и советоваться с командой.",
  "Люблю настольные игры, катаюсь на велосипеде и снимаю короткие ролики для своего канала. Последний год учусь рисовать в Procreate.",
  "Подрабатываю репетитором по математике два вечера в неделю, остальное время свободно.",
  "В школе была в совете старшеклассников: организовывали осенний бал и день самоуправления. Отвечала за афиши и регистрацию гостей.",
  "Умею монтировать видео в CapCut и верстать презентации в Figma.",
  "Хочу попасть в сообщество активных людей и научиться организовывать мероприятия с нуля.",
  "Хочу прокачать софт-скиллы, найти друзей и понять, в каком направлении студактива мне интереснее всего.",
];

async function main() {
  const season = await db.season.findFirst({ where: { isCurrent: true } });
  if (!season) throw new Error("Нет текущего сезона — сначала npm run db:seed.");

  const master = await db.role.findUnique({ where: { slug: "master" } });
  if (!master) throw new Error("Нет роли «Мастер отбора» — сначала npm run db:seed.");

  // Второй мастер, чтобы было что сравнивать в «Все анкеты».
  const voronov = await db.user.upsert({
    where: { email: "voronov@demo.local" },
    create: { email: "voronov@demo.local", firstName: "Илья", lastName: "Воронов" },
    update: {},
  });
  await db.userRole.upsert({
    where: { userId_roleId: { userId: voronov.id, roleId: master.id } },
    create: { userId: voronov.id, roleId: master.id },
    update: {},
  });

  const questions = await db.formQuestion.findMany({
    where: { seasonId: season.id, stageKind: "APPLICATION" },
    orderBy: { order: "asc" },
  });

  let created = 0;

  for (const [index, [lastName, firstName, middleName, username, form, course]] of CANDIDATES.entries()) {
    const email = `${username}@demo.local`;
    const user = await db.user.upsert({
      where: { email },
      create: { email, firstName, lastName, telegramUsername: username },
      update: {},
    });

    const exists = await db.application.findUnique({
      where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
    });
    if (exists) continue;

    const application = await db.application.create({
      data: {
        seasonId: season.id,
        userId: user.id,
        status: "SUBMITTED",
        lastName,
        firstName,
        middleName,
        studentId: index % 3 === 0 ? null : `2024${String(1000 + index * 37)}`,
        submittedAt: new Date(Date.now() - (CANDIDATES.length - index) * 3 * 60 * 60 * 1000),
      },
    });

    let long = 0;
    for (const question of questions) {
      let value: string | null = null;
      if (question.type === "SINGLE_CHOICE") {
        value = question.label.startsWith("Курс") ? course : question.label.startsWith("Форма") ? form : question.options[index % question.options.length]!;
      } else if (question.type === "URL") {
        value = `https://vk.com/${username}`;
      } else if (question.type === "SHORT_TEXT") {
        value = `ПИ2${4 - (index % 3)}-${(index % 4) + 1}`;
      } else {
        const answer = LONG_ANSWERS[long++ % LONG_ANSWERS.length]!;
        // Необязательный вопрос заполняет только каждый второй — как в жизни.
        if (question.required || index % 2 === 0) value = answer;
      }
      if (value) await db.answer.create({ data: { applicationId: application.id, questionId: question.id, value } });
    }

    await assignApplication(application.id, "APPLICATION", null);
    created++;
  }

  await demoSiteContent(season.id);
  console.log(`Готово: демо-кандидатов добавлено ${created}, мастер Илья Воронов (voronov@demo.local).`);
}

/**
 * Демо-тексты лендинга, чтобы увидеть все разделы. Только если тексты ещё
 * никто не правил: настоящие тексты организаторов скрипт не трогает.
 * История и место помечены как пример — это факты, их знают организаторы.
 */
async function demoSiteContent(seasonId: string) {
  if (await db.siteContent.findUnique({ where: { seasonId } })) return;

  const content: SiteContent = {
    ...DEFAULT_CONTENT,
    about: {
      title: "Что такое Школа Актива",
      text: "Школа Актива собирает студентов, которым мало просто ходить на пары. Здесь учатся придумывать события, вести проекты и договариваться в команде, а потом делают это в своём вузе. Несколько дней вместе, много практики и люди, с которыми потом хочется работать дальше.",
      points: ["Практика вместо лекций", "Команда на весь год", "Свой проект к концу Школы"],
    },
    program: {
      title: "Программа",
      items: [
        { title: "Мастер-классы", text: "Как придумать событие, найти на него людей и деньги и не выгореть по дороге." },
        { title: "Командные кейсы", text: "Команды решают настоящие задачи студенческого совета вместе с наставниками." },
        { title: "Защита проектов", text: "В конце Школы команды показывают свои идеи и получают обратную связь." },
        { title: "Вечерняя программа", text: "Игры, костёр и разговоры, ради которых многие и приезжают." },
        { title: "Встречи с выпускниками", text: "Те, кто прошёл Школу раньше, рассказывают, что из этого вышло." },
      ],
    },
    roles: {
      title: "Кем можно быть",
      items: [
        { title: "Участник", text: "Проходит программу, работает в команде и делает свой проект." },
        { title: "Медиа", text: "Снимает, пишет и монтирует, чтобы о Школе узнали все." },
        { title: "Ивент", text: "Отвечает за вечерние мероприятия и настроение." },
        { title: "Куратор", text: "Ведёт команду участников все дни Школы." },
      ],
    },
    history: {
      title: "История",
      items: [
        { year: "2024", title: "Пример: первая Школа", text: "Демо-текст. Настоящую историю впишут организаторы в админке." },
        { year: "2025", title: "Пример: вторая Школа", text: "Демо-текст. Замените в «Админка → Сайт → История»." },
      ],
    },
    venue: {
      title: "Где и когда",
      place: "Загородная база (пример)",
      dates: "Летом 2026 (пример)",
      text: "Демо-текст. Точное место и даты появятся здесь, когда их объявят.",
    },
    contacts: { telegram: "https://t.me/example", vk: "", email: "" },
  };
  await db.siteContent.create({ data: { seasonId, data: content as unknown as Prisma.InputJsonObject } });
  console.log("Демо-тексты сайта записаны.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
