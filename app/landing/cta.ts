import type { StageState } from "~~/lib/stages";

/**
 * Главная кнопка лендинга и строка состояния над названием.
 *
 * Одна формулировка на одно намерение по всей странице: шапка, первый
 * экран и финал зовут одной и той же кнопкой. Что на ней — решает этап
 * анкеты и то, вошёл ли человек.
 */
export interface LandingStage {
  id: string;
  kind: "APPLICATION" | "HOMEWORK" | "INTERVIEW" | "RESULTS";
  title: string;
  opensAt: string | null;
  closesAt: string | null;
  state: StageState;
}

export interface LandingCta {
  label: string;
  to: string;
  status: string;
  /** Анкета открыта — строку состояния можно отметить живой точкой. */
  live: boolean;
}

export function landingCta(
  stages: readonly LandingStage[],
  user: { isStaff: boolean } | null,
  format: (value: string, pattern: string) => string,
): LandingCta {
  const application = stages.find((stage) => stage.kind === "APPLICATION");
  const state = application?.state ?? "upcoming";

  const status =
    state === "open"
      ? application?.closesAt
        ? `Анкета открыта до ${format(application.closesAt, "d MMMM")}`
        : "Анкета открыта"
      : state === "upcoming"
        ? application?.opensAt
          ? `Анкета откроется ${format(application.opensAt, "d MMMM")}`
          : "Анкета скоро откроется"
        : "Приём анкет завершён";

  if (user) {
    return user.isStaff
      ? { label: "Кабинет организатора", to: "/staff", status, live: state === "open" }
      : { label: "Мой кабинет", to: "/cabinet", status, live: state === "open" };
  }
  if (state === "open") return { label: "Подать заявку", to: "/login", status, live: true };
  if (state === "upcoming") return { label: "Зарегистрироваться", to: "/login", status, live: false };
  return { label: "Войти в кабинет", to: "/login", status, live: false };
}
