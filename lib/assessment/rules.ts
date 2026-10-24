/**
 * Центр оценки: правила без базы — раскладка по группам и снимок места.
 *
 * Модуль чистый: его читают и сервер, и страница организатора.
 */

export interface Place {
  building: string | null;
  room: string | null;
  /** ISO-строка: снимок лежит в JSON. */
  startsAt: string | null;
  note: string | null;
}

/**
 * Разложить кандидатов поровну: каждый следующий — в самую маленькую группу,
 * при равенстве — в ту, что выше в списке. Уже разложенные остаются где были,
 * поэтому размеры после раскладки отличаются не больше чем на одного, только
 * если до неё группы были ровными, — иначе догоняются маленькие.
 */
export function balance(groups: readonly { id: string; size: number }[], candidates: readonly string[]): Map<string, string> {
  const sizes = groups.map((group) => ({ id: group.id, size: group.size }));
  const placed = new Map<string, string>();
  if (sizes.length === 0) return placed;

  for (const candidate of candidates) {
    let target = sizes[0]!;
    for (const group of sizes) if (group.size < target.size) target = group;
    target.size += 1;
    placed.set(candidate, target.id);
  }
  return placed;
}

export function placeOf(group: { building: string | null; room: string | null; startsAt: Date | string | null; note: string | null }): Place {
  return {
    building: group.building?.trim() || null,
    room: group.room?.trim() || null,
    startsAt: group.startsAt ? new Date(group.startsAt).toISOString() : null,
    note: group.note?.trim() || null,
  };
}

/** Место поменялось после рассылки — группе стоит сообщить снова. */
export function placeChanged(notified: Place | null, current: Place): boolean {
  if (!notified) return false;
  return (
    notified.building !== current.building ||
    notified.room !== current.room ||
    notified.startsAt !== current.startsAt ||
    notified.note !== current.note
  );
}

/** Чего не хватает, чтобы сообщить группе место. */
export function placeProblem(place: Place): string | null {
  if (!place.building && !place.room) return "Укажите корпус или аудиторию — без них кандидатам некуда идти.";
  if (!place.startsAt) return "Укажите дату и время начала.";
  return null;
}

/** «Корпус 2, аудитория 305» — для уведомления и кабинета. */
export function placeLine(place: Pick<Place, "building" | "room">): string {
  return [place.building && `корпус ${place.building}`, place.room && `аудитория ${place.room}`]
    .filter(Boolean)
    .join(", ")
    .replace(/^./, (first) => first.toUpperCase());
}

/** Снимок из JSON базы — или null, если там не то. */
export function readPlace(raw: unknown): Place | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const field = (key: string) => (typeof value[key] === "string" && value[key] ? (value[key] as string) : null);
  return { building: field("building"), room: field("room"), startsAt: field("startsAt"), note: field("note") };
}

// ---------------------------------------------------------------------------
// Самозапись: кандидат сам выбирает дату ЦО
// ---------------------------------------------------------------------------

/** Записаться можно не позже чем за 2 часа до начала. */
export const ASSESSMENT_BOOK_BEFORE_MS = 2 * 60 * 60 * 1000;
/** Перенести или отменить свою запись — не позже чем за 12 часов. */
export const ASSESSMENT_CHANGE_BEFORE_MS = 12 * 60 * 60 * 1000;

export interface BookableGroup {
  /** null — группу собирают организаторы, записи нет. */
  capacity: number | null;
  /** Пусто — всем факультетам. */
  faculties: readonly string[];
  startsAt: Date | string | null;
  /** Сколько уже в группе. */
  taken: number;
}

/** Предлагается ли дата этому кандидату (место — отдельно: см. hasRoom). */
export function offeredTo(group: BookableGroup, faculty: string | null, now: Date): boolean {
  if (group.capacity === null || !group.startsAt) return false;
  if (new Date(group.startsAt).getTime() - now.getTime() < ASSESSMENT_BOOK_BEFORE_MS) return false;
  return group.faculties.length === 0 || (faculty !== null && group.faculties.includes(faculty));
}

export function hasRoom(group: BookableGroup): boolean {
  return group.capacity !== null && group.taken < group.capacity;
}

/** Свою запись можно поменять, пока до начала больше 12 часов. */
export function canChangeBooking(startsAt: Date | string | null, now: Date): boolean {
  return !startsAt || new Date(startsAt).getTime() - now.getTime() >= ASSESSMENT_CHANGE_BEFORE_MS;
}
