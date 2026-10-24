import { FACULTIES } from "./onboarding";

/**
 * Фильтр по факультету в списках организатора: анкеты, ДЗ, собеседования,
 * центр оценки. Только для просмотра — права и выборки от факультета не
 * зависят (отбор — единый поток), каждый по-прежнему видит всех.
 *
 * Модуль чистый: фильтром пользуются и сервер, и страницы.
 */
export const NO_FACULTY = "none";

export type Faculty = (typeof FACULTIES)[number];
/** "" — все факультеты; NO_FACULTY — кто факультет не указал. */
export type FacultyFilter = "" | typeof NO_FACULTY | Faculty;

export const FACULTY_OPTIONS: { value: FacultyFilter; label: string }[] = [
  { value: "", label: "Все факультеты" },
  ...FACULTIES.map((faculty) => ({ value: faculty, label: faculty })),
  { value: NO_FACULTY, label: "Не указан" },
];

export function parseFacultyFilter(raw: unknown): FacultyFilter {
  if (raw === NO_FACULTY) return NO_FACULTY;
  return (FACULTIES as readonly string[]).includes(raw as string) ? (raw as Faculty) : "";
}

export function facultyMatches(faculty: string | null | undefined, filter: FacultyFilter): boolean {
  if (!filter) return true;
  if (filter === NO_FACULTY) return !faculty;
  return faculty === filter;
}
