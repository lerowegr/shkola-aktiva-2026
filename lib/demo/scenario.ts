import { fullName } from "~~/lib/applications/staff";
import { homeworkText } from "~~/lib/applications/homework";
import { publishDecisions, setDecision } from "~~/lib/applications/decisions";
import { notifyGroup, placeMember, saveGroup, setExperts } from "~~/lib/assessment/groups";
import { db } from "~~/lib/db";
import { createSlots } from "~~/lib/interviews/slots";

/**
 * Демо-отбор для показа сайта: выдуманные организаторы и кандидаты на
 * разных этапах — от «только зарегистрировалась» до опубликованных итогов.
 *
 * Работает ТОЛЬКО на демо-копии (NUXT_PUBLIC_DEMO=true, своя база): все
 * этапы открыты, данные пересоздаются кнопкой «Сбросить демо». На боевом
 * сайте ни вход «как…», ни этот сценарий недоступны (server/api/demo/*).
 *
 * Люди — @demo.local; при сбросе удаляются вместе со всем, что на них висит
 * (анкеты, оценки, записи), группы ЦО и слоты собеседований — тоже.
 */
export const DEMO_DOMAIN = "demo.local";

export interface DemoPerson {
  key: string;
  firstName: string;
  lastName: string;
  /** Что показывает этот вход — подпись в списке «Войти как…». */
  about: string;
  role?: "admin" | "lead" | "master";
}

export const DEMO_STAFF: DemoPerson[] = [
  { key: "admin", firstName: "Демо", lastName: "Админ", about: "Тех.админ: все права, админка, люди, роли", role: "admin" },
  { key: "lead", firstName: "Полина", lastName: "Орлова", about: "Главный организатор: этапы, решения, ЦО, ведёт собеседования", role: "lead" },
  { key: "katya", firstName: "Катя", lastName: "Белова", about: "Мастер отбора, эксперт ЦО, собеседует вместе с Полиной", role: "master" },
  { key: "ilya", firstName: "Илья", lastName: "Воронов", about: "Мастер отбора и эксперт ЦО", role: "master" },
];

export const DEMO_CANDIDATES: DemoPerson[] = [
  { key: "masha", firstName: "Маша", lastName: "Новикова", about: "Только зарегистрировалась — экран знакомства" },
  { key: "anya", firstName: "Аня", lastName: "Смирнова", about: "Заполняет анкету — черновик" },
  { key: "boris", firstName: "Борис", lastName: "Козлов", about: "Отправил анкету — ждёт проверки" },
  { key: "vika", firstName: "Вика", lastName: "Морозова", about: "Анкета и ДЗ оценены, решение ещё не объявлено" },
  { key: "gleb", firstName: "Глеб", lastName: "Волков", about: "Не прошёл анкету" },
  { key: "dasha", firstName: "Даша", lastName: "Лебедева", about: "Прошла анкету, в группе ЦО — место и время" },
  { key: "egor", firstName: "Егор", lastName: "Соколов", about: "Прошёл ЦО, эксперты его оценили" },
  { key: "zhenya", firstName: "Женя", lastName: "Попова", about: "Записана на собеседование" },
  { key: "igor", firstName: "Игорь", lastName: "Кузнецов", about: "Собеседование прошло, итог не объявлен" },
  { key: "kira", firstName: "Кира", lastName: "Павлова", about: "Итоги: прошла в участники" },
  { key: "lyova", firstName: "Лёва", lastName: "Семёнов", about: "Итоги: не прошёл" },
];

export const demoEmail = (key: string) => `${key}@${DEMO_DOMAIN}`;

const DAY = 24 * 60 * 60 * 1000;
const FACULTIES = ["СНиМК", "МЭО", "ФЭБ", "ЮФ", "ВШУ", "ИТиАБД", "НАБ", "ФФ"];
const LONG = [
  "В школе я два года был в совете старшеклассников: мы готовили праздники и сбор макулатуры. Самым значимым было, что каждый отвечал за свою часть, а итог получался общий. Моя роль обычно — договариваться с людьми и держать сроки, и мне это нравится больше, чем делать всё одному.",
  "Для меня важнее интересы команды, если от результата зависят другие. Но я всегда сначала проговариваю, что мне неудобно, — так проще найти вариант, который устроит всех, и не копить обиды. Пример: однажды я перенёс свои планы, чтобы мы успели сдать общий проект вовремя.",
  "Сложнее всего было, когда половина группы пропала перед дедлайном. Я расписал задачи по людям, написал каждому лично и взял на себя самую большую часть. Работу сделали бы эффективнее общий чат с понятными сроками и короткие созвоны раз в неделю, чтобы не терять друг друга.",
  "Сильные стороны: я быстро нахожу общий язык, умею доводить дела до конца и не боюсь выступать. Слабые: беру на себя слишком много, иногда тороплюсь и не перепроверяю детали. Сильные стороны помогают в учёбе и в команде, а со слабыми учусь работать — веду список задач и прошу коллег проверять.",
  "От Школы Актива я жду новых знакомств и навыков, которых нет в учебном плане: как запускать проекты, как вести команду, как говорить так, чтобы тебя слушали. Хочу после неё прийти в студсовет и сделать что-то полезное для первокурсников, которым сейчас трудно освоиться в вузе.",
];

function answerFor(question: { type: string; options: string[]; format: string | null; label: string }, index: number) {
  if (question.type === "SINGLE_CHOICE") return question.options[index % question.options.length] ?? question.options[0] ?? "";
  if (question.type === "MULTI_CHOICE") return question.options.slice(0, 1);
  if (question.type === "URL") return `https://disk.yandex.ru/d/demo-${index + 1}-sha2026`;
  if (question.format === "GROUP") return `ТЦБМ2${index % 2 ? 4 : 5}-${(index % 3) + 1}`;
  if (question.format === "VK") return `https://vk.ru/demo_${index + 1}`;
  if (question.format === "TELEGRAM") return `@demo_candidate_${index + 1}`;
  if (question.format === "PHONE") return `+7 (900) 000-00-${String(10 + index).padStart(2, "0")}`;
  if (question.format === "DIGITS") return String(190000 + index);
  if (question.type === "LONG_TEXT") return LONG[index % LONG.length]!;
  return "Из Telegram-канала Школы Актива";
}

export async function resetDemo(now = new Date()): Promise<{ staff: number; candidates: number }> {
  const season = await db.season.findFirstOrThrow({ where: { isCurrent: true }, select: { id: true } });
  const seasonId = season.id;

  // --- Чистим прошлое демо -----------------------------------------------------
  await db.assessmentGroup.deleteMany({ where: { seasonId } });
  await db.interviewSlot.deleteMany({ where: { seasonId } });
  await db.user.deleteMany({ where: { email: { endsWith: `@${DEMO_DOMAIN}` } } });

  // Все этапы открыты: в демо видно каждый экран сразу. Итоги — по решениям.
  const stages = await db.stage.findMany({ where: { seasonId }, select: { id: true, kind: true } });
  const dates: Record<string, [number, number]> = {
    APPLICATION: [-10, 4],
    HOMEWORK: [-10, 4],
    ASSESSMENT: [-2, 6],
    INTERVIEW: [-1, 10],
    RESULTS: [12, 14],
  };
  for (const stage of stages) {
    const [from, to] = dates[stage.kind] ?? [0, 0];
    await db.stage.update({
      where: { id: stage.id },
      data: {
        mode: stage.kind === "RESULTS" ? "AUTO" : "OPEN",
        opensAt: new Date(now.getTime() + from * DAY),
        closesAt: new Date(now.getTime() + to * DAY),
        description:
          stage.kind === "ASSESSMENT"
            ? "Очный групповой этап: задания в команде вместе с другими кандидатами, около трёх часов. Возьмите студенческий."
            : undefined,
      },
    });
  }

  // --- Организаторы -------------------------------------------------------------
  const roles = await db.role.findMany({ select: { id: true, slug: true } });
  const roleId = (slug: string) => roles.find((role) => role.slug === slug)!.id;
  const staff: Record<string, string> = {};
  for (const person of DEMO_STAFF) {
    const user = await db.user.create({
      data: {
        email: demoEmail(person.key),
        firstName: person.firstName,
        lastName: person.lastName,
        roles: { create: { roleId: roleId(person.role!) } },
      },
      select: { id: true },
    });
    staff[person.key] = user.id;
  }

  // --- Кандидаты ----------------------------------------------------------------
  const questions = await db.formQuestion.findMany({
    where: { seasonId, stageKind: "APPLICATION" },
    orderBy: { order: "asc" },
    select: { id: true, section: true, type: true, label: true, options: true, format: true, required: true },
  });
  const sections = await db.formSection.findMany({ where: { seasonId, stageKind: "APPLICATION" }, select: { title: true, homework: true } });
  const homeworkSections = new Set(sections.filter((section) => section.homework).map((section) => section.title));
  const criteria = await db.criterion.findMany({ where: { seasonId }, select: { id: true, stageKind: true, maxScore: true, levels: true } });
  const markers = await db.marker.findMany({ where: { seasonId }, select: { id: true, stageKind: true, title: true } });

  const candidate: Record<string, { userId: string; applicationId: string | null }> = {};
  for (const [index, person] of DEMO_CANDIDATES.entries()) {
    const onboarded = person.key !== "masha";
    const user = await db.user.create({
      data: {
        email: demoEmail(person.key),
        firstName: person.firstName,
        lastName: person.lastName,
        ...(onboarded
          ? {
              course: String((index % 2) + 1),
              faculty: FACULTIES[index % FACULTIES.length],
              studentId: String(190000 + index),
              phone: `+7 (900) 000-00-${String(10 + index).padStart(2, "0")}`,
              onboardedAt: new Date(now.getTime() - (12 - index) * DAY),
            }
          : {}),
      },
      select: { id: true },
    });
    candidate[person.key] = { userId: user.id, applicationId: null };
    if (!onboarded) continue;

    const submitted = person.key !== "anya";
    const answered = submitted ? questions : questions.slice(0, Math.ceil(questions.length / 2));
    const answers = Object.fromEntries(answered.map((question, i) => [question.id, answerFor(question, index + i)]));
    const application = await db.application.create({
      data: {
        seasonId,
        userId: user.id,
        status: submitted ? "SUBMITTED" : "DRAFT",
        submittedAt: submitted ? new Date(now.getTime() - (9 - (index % 6)) * DAY) : null,
        lastName: person.lastName,
        firstName: person.firstName,
        studentId: String(190000 + index),
        answers: { create: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })) },
      },
      select: { id: true },
    });
    candidate[person.key]!.applicationId = application.id;

    if (submitted) {
      const text = homeworkText(questions, homeworkSections, answers);
      if (text) await db.submission.create({ data: { applicationId: application.id, stageKind: "HOMEWORK", text, via: "SITE" } });
    }
  }

  const app = (key: string) => candidate[key]!.applicationId!;
  const master = (index: number) => (index % 2 ? staff.ilya! : staff.katya!);

  // Оценка: полная (все критерии), с маркером и комментарием — или пустая.
  async function review(applicationId: string, stageKind: "APPLICATION" | "HOMEWORK" | "ASSESSMENT" | "INTERVIEW", reviewerId: string, level: "none" | "high" | "low") {
    const created = await db.review.upsert({
      where: { applicationId_stageKind_reviewerId: { applicationId, stageKind, reviewerId } },
      create: { applicationId, stageKind, reviewerId, assignedById: staff.lead },
      update: {},
      select: { id: true },
    });
    if (level === "none") return;
    const stageCriteria = criteria.filter((criterion) => criterion.stageKind === stageKind);
    for (const criterion of stageCriteria) {
      const scores = (criterion.levels as { score: number }[]).map((item) => item.score);
      const score = level === "high" ? Math.max(...scores, criterion.maxScore) : Math.min(...scores, 0);
      await db.reviewScore.create({ data: { reviewId: created.id, criterionId: criterion.id, score } });
    }
    const marker = markers.find((item) => item.stageKind === stageKind);
    if (marker) {
      await db.reviewMarker.create({
        data: { reviewId: created.id, markerId: marker.id, note: level === "high" ? "Ярко проявился — запомнился" : "Почти не проявился" },
      });
    }
    await db.review.update({
      where: { id: created.id },
      data: {
        comment: level === "high" ? "Сильные ответы, видна мотивация и опыт." : "Ответы короткие, мало конкретики.",
        updatedById: reviewerId,
      },
    });
  }

  // Анкета + ДЗ: всем отправившим назначен мастер.
  const sent = DEMO_CANDIDATES.filter((person) => !["masha", "anya"].includes(person.key));
  for (const [index, person] of sent.entries()) {
    const level = person.key === "boris" ? "none" : person.key === "gleb" ? "low" : "high";
    await review(app(person.key), "APPLICATION", master(index), level);
    await review(app(person.key), "HOMEWORK", master(index), level);
  }

  // Решения по анкете и ДЗ: опубликованы всем, кроме Вики и Бориса.
  const passed = ["dasha", "egor", "zhenya", "igor", "kira", "lyova"];
  await setDecision(app("gleb"), "APPLICATION", "REJECTED", staff.lead!);
  for (const key of passed) {
    await setDecision(app(key), "APPLICATION", "PASSED", staff.lead!);
    // Допуск к собеседованию (решение этапа ДЗ) — после ЦО: Даша идёт на ЦО,
    // Егор его прошёл и ждёт, остальные уже записаны или прошли собеседование.
    if (!["dasha", "egor"].includes(key)) await setDecision(app(key), "HOMEWORK", "PASSED", staff.lead!);
  }
  await publishDecisions(seasonId, "APPLICATION");
  await publishDecisions(seasonId, "HOMEWORK");
  await setDecision(app("vika"), "APPLICATION", "PASSED", staff.lead!);

  // Центр оценки: две группы, место сообщено. Время — ровные часы по Москве.
  const at = (offsetDays: number, hour: number) => {
    const date = new Date(now.getTime() + offsetDays * DAY);
    date.setUTCHours(hour - 3, 0, 0, 0);
    return date.toISOString();
  };
  const first = await saveGroup(seasonId, {
    title: "Группа 1",
    building: "2",
    room: "305",
    startsAt: at(2, 18),
    note: "Возьмите студенческий и визуальные материалы к инициативе.",
  });
  const second = await saveGroup(seasonId, {
    title: "Группа 2",
    building: "Главный",
    room: "Актовый зал",
    startsAt: at(-2, 15),
    note: "",
  });
  if (first.ok && second.ok) {
    await setExperts(seasonId, first.id, [staff.katya!, staff.ilya!], staff.lead!);
    await setExperts(seasonId, second.id, [staff.katya!], staff.lead!);
    await placeMember(seasonId, app("dasha"), first.id, staff.lead!);
    for (const key of ["egor", "zhenya", "igor", "kira", "lyova"]) await placeMember(seasonId, app(key), second.id, staff.lead!);
    await notifyGroup(seasonId, first.id);
    await notifyGroup(seasonId, second.id);
    // Вторая группа уже прошла ЦО — эксперт её оценил.
    for (const key of ["egor", "zhenya", "igor", "kira", "lyova"]) await review(app(key), "ASSESSMENT", staff.katya!, key === "lyova" ? "low" : "high");
  }

  // Собеседования: прошедшие — вчера, Женя — послезавтра.
  const slot = (offsetDays: number, hour: number) => {
    const startsAt = new Date(now.getTime() + offsetDays * DAY);
    startsAt.setUTCHours(hour - 3, 0, 0, 0); // время по Москве
    return { startsAt, endsAt: new Date(startsAt.getTime() + 20 * 60 * 1000) };
  };
  const [past1, past2, past3, future1, future2] = await createSlots({
    seasonId,
    slots: [slot(-1, 16), slot(-1, 17), slot(-1, 18), slot(2, 16), slot(2, 17)],
    location: "Корпус 2, аудитория 410",
    capacity: 1,
    interviewerIds: [staff.lead!, staff.katya!],
    createdById: staff.lead!,
  });
  const bookings: [string, { id: string } | undefined][] = [
    ["igor", past1],
    ["kira", past2],
    ["lyova", past3],
    ["zhenya", future1],
  ];
  for (const [key, booked] of bookings) {
    if (!booked) continue;
    await db.interviewBooking.create({ data: { slotId: booked.id, applicationId: app(key), createdAt: new Date(now.getTime() - 3 * DAY) } });
    const done = key !== "zhenya";
    // Собеседуют вдвоём: у каждого своя оценка и своя колонка в сценарии.
    for (const interviewer of [staff.lead!, staff.katya!]) {
      await review(app(key), "INTERVIEW", interviewer, done ? (key === "lyova" ? "low" : "high") : "none");
    }
  }
  void future2; // свободное время: Женя или кто-то ещё может перезаписаться

  // Итоги собеседований: Кира прошла, Лёва нет; по Игорю ещё решают.
  await setDecision(app("kira"), "INTERVIEW", "PASSED", staff.lead!);
  await setDecision(app("lyova"), "INTERVIEW", "REJECTED", staff.lead!);
  await publishDecisions(seasonId, "INTERVIEW");

  // Немного «жизни» в журнале — кто что делал.
  await db.auditLog.create({ data: { actorId: staff.admin, action: "demo.reset", meta: { at: now.toISOString() } } });

  return { staff: DEMO_STAFF.length, candidates: DEMO_CANDIDATES.length };
}

/** Подпись для списка входов: имя и что за этап. */
export function demoAccounts(people: { email: string | null; firstName: string | null; lastName: string | null; id: string }[]) {
  const all = [...DEMO_STAFF.map((person) => ({ ...person, staff: true })), ...DEMO_CANDIDATES.map((person) => ({ ...person, staff: false }))];
  return all.flatMap((person) => {
    const user = people.find((item) => item.email === demoEmail(person.key));
    return user ? [{ id: user.id, name: fullName({ lastName: user.lastName, firstName: user.firstName }), about: person.about, staff: person.staff }] : [];
  });
}
