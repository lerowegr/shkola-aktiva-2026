import { formatValue, type AnswerValue } from "~~/lib/applications/form";

/**
 * Знакомство при первом входе: кто ты — до анкеты, теста и кабинета.
 *
 * Модуль чистый: одни правила для формы в браузере и для сервера. Группа и
 * VK сюда не входят — они в анкете отбора.
 */

export const COURSES = ["1", "2"] as const;
/** Факультеты — как в листе «вопросы анкеты» таблицы «Портрет участника ША'26». */
export const FACULTIES = ["МЭО", "СНиМК", "ВШУ", "НАБ", "ИТиАБД", "ФЭБ", "ЮФ", "ФФ"] as const;

export interface OnboardingInput {
  lastName: string;
  firstName: string;
  middleName: string;
  course: string;
  faculty: string;
  studentId: string;
  phone: string;
  consent: boolean;
}

export type OnboardingField = keyof OnboardingInput;

export type OnboardingResult =
  | { ok: true; value: Omit<OnboardingInput, "consent" | "middleName"> & { middleName: string | null } }
  | { ok: false; problems: { field: OnboardingField; message: string }[] };

const NAME = /^[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё' -]{0,59}$/;

export function checkOnboarding(input: OnboardingInput): OnboardingResult {
  const problems: { field: OnboardingField; message: string }[] = [];
  const name = (field: "lastName" | "firstName" | "middleName", label: string, required: boolean) => {
    const value = input[field].trim().replace(/\s+/g, " ");
    if (!value) {
      if (required) problems.push({ field, message: `Укажите ${label}.` });
      return value;
    }
    if (!NAME.test(value)) problems.push({ field, message: `${label[0]!.toUpperCase()}${label.slice(1)} — только буквы, пробел и дефис.` });
    return value;
  };

  const lastName = name("lastName", "фамилию", true);
  const firstName = name("firstName", "имя", true);
  const middleName = name("middleName", "отчество", false);

  if (!(COURSES as readonly string[]).includes(input.course)) problems.push({ field: "course", message: "Выберите курс." });
  if (!(FACULTIES as readonly string[]).includes(input.faculty)) problems.push({ field: "faculty", message: "Выберите факультет." });

  const studentId = formatValue("DIGITS", input.studentId);
  if (!input.studentId.trim()) problems.push({ field: "studentId", message: "Укажите номер студенческого билета." });
  else if (!studentId.ok) problems.push({ field: "studentId", message: "Номер студенческого — только цифры." });

  const phone = formatValue("PHONE", input.phone);
  if (!input.phone.trim()) problems.push({ field: "phone", message: "Укажите телефон — по нему свяжемся, если не ответите в Telegram." });
  else if (!phone.ok) problems.push({ field: "phone", message: "Телефон — российский номер: +7 и 10 цифр." });

  if (!input.consent) problems.push({ field: "consent", message: "Без согласия на обработку данных участвовать в отборе нельзя." });

  if (problems.length) return { ok: false, problems };
  return {
    ok: true,
    value: {
      lastName,
      firstName,
      middleName: middleName || null,
      course: input.course,
      faculty: input.faculty,
      studentId: studentId.ok ? studentId.value : "",
      phone: phone.ok ? phone.value : "",
    },
  };
}

interface Question {
  id: string;
  type: string;
  label: string;
  options: string[];
  format: string | null;
}

/**
 * Ответы анкеты, которые можно взять из знакомства: курс, факультет,
 * телефон. Вопросы анкеты организаторы пишут сами, поэтому узнаём их по
 * смыслу: телефон — по формату, курс и факультет — по названию и варианту.
 */
export function suggestAnswers(
  questions: readonly Question[],
  profile: { course: string | null; faculty: string | null; phone: string | null },
): Record<string, AnswerValue> {
  const result: Record<string, AnswerValue> = {};
  for (const question of questions) {
    if (question.format === "PHONE" && profile.phone) {
      result[question.id] = profile.phone;
      continue;
    }
    if (question.type !== "SINGLE_CHOICE") continue;
    if (/курс/i.test(question.label) && profile.course) {
      const digit = new RegExp(`(^|\\D)${profile.course}(\\D|$)`);
      const option = question.options.find((item) => digit.test(item));
      if (option) result[question.id] = option;
    } else if (/факультет/i.test(question.label) && profile.faculty) {
      const wanted = profile.faculty.toLowerCase();
      const option =
        question.options.find((item) => item.trim().toLowerCase() === wanted) ??
        question.options.find((item) => item.toLowerCase().includes(wanted));
      if (option) result[question.id] = option;
    }
  }
  return result;
}
