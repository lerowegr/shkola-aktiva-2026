import { formatValue, type AnswerValue } from "~~/lib/applications/form";
import { loginProblem, normalizeLogin } from "~~/lib/auth/login";
import { passwordProblem } from "~~/lib/auth/password-rules";

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
}

export type OnboardingField = keyof OnboardingInput;

export type OnboardingResult =
  | { ok: true; value: Omit<OnboardingInput, "middleName"> & { middleName: string | null } }
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

/**
 * Данные для входа — у тех, кто пришёл через Telegram и пароля ещё не
 * задавал: логин, почта и пароль. Дальше входить можно и без Telegram.
 */
export interface CredentialsInput {
  login: string;
  email: string;
  password: string;
  repeat: string;
}

export type CredentialsField = keyof CredentialsInput;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function checkCredentials(
  input: CredentialsInput,
): { ok: true; value: { login: string; email: string; password: string } } | { ok: false; problems: { field: CredentialsField; message: string }[] } {
  const problems: { field: CredentialsField; message: string }[] = [];
  const login = normalizeLogin(input.login);
  const email = input.email.trim().toLowerCase();

  const badLogin = loginProblem(login);
  if (badLogin) problems.push({ field: "login", message: badLogin });
  if (!email) problems.push({ field: "email", message: "Укажите почту — на неё можно будет войти вместо логина." });
  else if (!EMAIL.test(email) || email.length > 120) problems.push({ field: "email", message: "Почта указана неверно: нужен адрес вида name@mail.ru." });

  const badPassword = passwordProblem(input.password, { email });
  if (badPassword) problems.push({ field: "password", message: badPassword });
  else if (login && input.password.toLowerCase().includes(login)) {
    problems.push({ field: "password", message: "Пароль повторяет логин — его угадают с первой попытки." });
  }
  if (input.password && input.repeat !== input.password) problems.push({ field: "repeat", message: "Пароли не совпадают." });

  if (problems.length) return { ok: false, problems };
  return { ok: true, value: { login, email, password: input.password } };
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
