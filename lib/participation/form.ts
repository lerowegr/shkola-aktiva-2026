import { z } from "zod";

export const PARTICIPATION_PATH = "/cabinet/participation";
export const PARTICIPATION_INVITATION = {
  title: "Ты прошёл отбор в Школу Актива!",
  body: "Поздравляем! Заполни анкету участника и сообщи, сможешь ли ты быть с нами все три дня, 27–29 ноября.",
};
export const PARENT_CONSENT = {
  path: "/participation/parent-consent.docx",
  filename: "Заявление для несовершеннолетних.docx",
  caption: "Заявление для несовершеннолетних. Его нужно подписать у родителя или законного представителя.",
};

export const PARTICIPATION_SUCCESS = "Ваши данные успешно отправлены организаторам";

export const QUESTIONS = {
  consent: "Я даю своё согласие на обработку (в том числе на сбор, систематизацию, накопление, хранение, уточнение (обновление, изменение), использование, распространение, передачу (в том числе трансграничную передачу), обезличивание, блокирование и уничтожение моих персональных данных в соответствии с требованиями ФЗ №152-ФЗ «О персональных данных».",
  attending: "Сможешь ли ты быть все три дня на Школе Актива 27–29 ноября? Приехать позже или уехать раньше не получится.",
  passportName: "ФИО полностью, как в паспорте",
  passportNumber: "Серия и номер паспорта (4522 123456)",
  passportDate: "Дата выдачи паспорта (01.01.2026)",
  passportIssuer: "Кем выдан паспорт (полностью, как в паспорте)",
  citizenship: "Гражданство (например, Российская Федерация)",
  studentId: "Номер студенческого билета",
  diet: "Придерживаешься ли ты особого питания?",
  conditions: "Есть ли у тебя хронические заболевания? Если да, расскажи о них подробнее.",
  medication: "Принимаешь ли ты на постоянной основе какие-либо лекарства? Если да, то какие?",
  healthNotes: "Если есть что-то важное о здоровье или твоём состоянии, о чём ты хочешь сообщить, напиши здесь.",
  minor: "На 27 ноября тебе ещё не исполнится 18 лет?",
  scan: "Подпиши заявление у родителя или законного представителя и пришли фото или PDF через бота. Оригинал привези на встречу 27.11.2026.",
} as const;

export type QuestionKey = keyof typeof QUESTIONS;
export type Questions = Record<QuestionKey, string>;
export const questionKeys = Object.keys(QUESTIONS) as QuestionKey[];

export const questionsSchema = z.record(z.enum(questionKeys as [QuestionKey, ...QuestionKey[]]), z.string().trim().min(1).max(1500));

function isCalendarDate(text: string) {
  const [day, month, year] = text.split(".");
  const date = new Date(`${year}-${month}-${day}T00:00:00+03:00`);
  if (!Number.isFinite(date.getTime()) || date > new Date()) return false;
  return new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Moscow" }).format(date) === text;
}

const required = z.string().trim().min(1, "Заполните обязательное поле.").max(500);
const notes = z.string().trim().max(2000);
const citizenship = required.regex(
  /^(?=.*\p{Ll})\p{L}{3,}(?:[ -]\p{L}+)*$/u,
  "Напишите гражданство полностью, например «Российская Федерация».",
);

export const participationSchema = z.discriminatedUnion("attending", [
  z.object({ consent: z.literal(true, "Для отправки нужно согласие на обработку данных."), attending: z.literal(false) }),
  z.object({
    consent: z.literal(true, "Для отправки нужно согласие на обработку данных."),
    attending: z.literal(true),
    passportName: required,
    passportNumber: z.string().trim().regex(/^\d{4} \d{6}$/, "Серия и номер паспорта — в формате 4522 123456."),
    passportDate: z.string().regex(/^\d{2}\.\d{2}\.\d{4}$/, "Дата выдачи паспорта — в формате 01.01.2026.")
      .refine(isCalendarDate, "Укажите существующую дату выдачи паспорта."),
    passportIssuer: required,
    citizenship,
    studentId: required,
    diet: required,
    conditions: notes,
    medication: notes,
    healthNotes: notes,
    minor: z.boolean(),
  }),
]);
