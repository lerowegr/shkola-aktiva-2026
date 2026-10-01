import { z } from "zod";

/**
 * Тексты лендинга: схема, значения по умолчанию и сборка из того, что
 * лежит в базе.
 *
 * Модуль чистый — без базы: им пользуются и сервер, и форма в админке.
 *
 * Значения по умолчанию — только правда о том, как устроен отбор на этой
 * платформе. Программу, роли, историю, место и контакты знают организаторы:
 * по умолчанию они пустые, и пустой раздел на сайте не показывается.
 * Выдуманная дата на лендинге хуже, чем отсутствие раздела.
 */

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Слишком длинно: до ${max} знаков.` });

const link = z
  .string()
  .trim()
  .max(200, { error: "Слишком длинная ссылка." })
  .refine((value) => value === "" || /^https:\/\/\S+$/.test(value), {
    error: "Ссылка должна начинаться с https://",
  });

const email = z
  .string()
  .trim()
  .max(120)
  .refine((value) => value === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), { error: "Почта указана неверно." });

const list = <T extends z.ZodType>(item: T, max: number) =>
  z.array(item).max(max, { error: `Не больше ${max} пунктов.` });

const card = z.object({ title: text(60).min(1, { error: "У пункта нужен заголовок." }), text: text(240) });

export const SECTIONS = {
  hero: z.object({ tagline: text(160) }),
  about: z.object({ title: text(80), text: text(900), points: list(text(140), 4) }),
  selection: z.object({
    title: text(80),
    intro: text(300),
    steps: z.object({
      APPLICATION: text(300),
      HOMEWORK: text(300),
      INTERVIEW: text(300),
      RESULTS: text(300),
    }),
  }),
  program: z.object({ title: text(80), items: list(card, 8) }),
  roles: z.object({ title: text(80), items: list(card, 8) }),
  history: z.object({
    title: text(80),
    items: list(
      z.object({ year: text(16).min(1, { error: "Укажите год." }), title: text(80), text: text(300) }),
      12,
    ),
  }),
  venue: z.object({ title: text(80), place: text(120), dates: text(80), text: text(400) }),
  faq: z.object({
    title: text(80),
    items: list(
      z.object({ question: text(160).min(1, { error: "Нужен вопрос." }), answer: text(800).min(1, { error: "Нужен ответ." }) }),
      16,
    ),
  }),
  contacts: z.object({ telegram: link, vk: link, email }),
} as const;

export type SectionKey = keyof typeof SECTIONS;
export const SECTION_KEYS = Object.keys(SECTIONS) as SectionKey[];

export const siteContentSchema = z.object(SECTIONS);
export type SiteContent = z.infer<typeof siteContentSchema>;

/** Подписи разделов — для админки и журнала. */
export const SECTION_LABELS: Record<SectionKey, string> = {
  hero: "Первый экран",
  about: "О Школе",
  selection: "Отбор",
  program: "Программа",
  roles: "Роли",
  history: "История",
  venue: "Место и даты",
  faq: "Вопросы",
  contacts: "Контакты",
};

export const DEFAULT_CONTENT: SiteContent = {
  hero: {
    tagline: "Анкета, домашнее задание и собеседование. Подавай заявку и следи за этапами в одном кабинете.",
  },
  about: {
    title: "Что такое Школа Актива",
    text: "",
    points: [],
  },
  selection: {
    title: "Как попасть",
    intro: "Отбор идёт по шагам. Результат каждого шага приходит в кабинет и в Telegram.",
    steps: {
      APPLICATION: "Расскажи о себе. Анкета сохраняется сама: можно заполнять в несколько заходов и отправить, когда всё готово.",
      HOMEWORK: "Прошедшим анкету откроется задание. Ответ сдаётся файлом PDF на сайте или боту в Telegram.",
      INTERVIEW: "Выбери удобное время в кабинете и приходи знакомиться. Перенести запись можно за 12 часов.",
      RESULTS: "Итоги появятся в кабинете, а уведомление придёт на сайт и в Telegram.",
    },
  },
  program: { title: "Программа", items: [] },
  roles: { title: "Кем можно быть", items: [] },
  history: { title: "История", items: [] },
  venue: { title: "Где и когда", place: "", dates: "", text: "" },
  faq: {
    title: "Частые вопросы",
    items: [
      {
        question: "Как подать заявку?",
        answer:
          "Нажми «Подать заявку», войди через Telegram или почту и заполни анкету в кабинете. Черновик сохраняется сам.",
      },
      {
        question: "Можно ли поправить анкету после отправки?",
        answer: "Нет. Отправленную анкету уже читают организаторы, поэтому перед отправкой проверь ответы.",
      },
      {
        question: "Как сдать домашнее задание?",
        answer:
          "Одним файлом PDF до 20 МБ: в кабинете на сайте или отправь файл боту в Telegram. До дедлайна можно пересдать, засчитается последняя версия.",
      },
      {
        question: "Можно перенести собеседование?",
        answer: "Да, в кабинете, но не позже чем за 12 часов до начала.",
      },
      {
        question: "Где задать вопрос организаторам?",
        answer: "В кабинете есть раздел «Сообщения». Можно написать и боту в Telegram: ответ придёт туда же.",
      },
    ],
  },
  contacts: { telegram: "", vk: "", email: "" },
};

/**
 * Тексты из базы поверх значений по умолчанию — по разделам. Раздел, который
 * не прошёл схему (старый формат, ручная правка базы), берётся по умолчанию:
 * сломанный раздел не должен ронять главную страницу.
 */
export function mergeContent(raw: unknown): SiteContent {
  const stored = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const result = { ...DEFAULT_CONTENT } as Record<SectionKey, unknown>;
  for (const key of SECTION_KEYS) {
    if (!(key in stored)) continue;
    const parsed = SECTIONS[key].safeParse(stored[key]);
    if (parsed.success) result[key] = parsed.data;
  }
  return result as SiteContent;
}

/** Есть ли что показать в разделе. Пустой раздел на сайте не рисуется. */
export function hasContent(content: SiteContent, key: SectionKey): boolean {
  switch (key) {
    case "about":
      return Boolean(content.about.text || content.about.points.length);
    case "program":
    case "roles":
    case "history":
    case "faq":
      return content[key].items.length > 0;
    case "venue":
      return Boolean(content.venue.place || content.venue.dates || content.venue.text);
    case "contacts":
      return Boolean(content.contacts.telegram || content.contacts.vk || content.contacts.email);
    default:
      return true;
  }
}
