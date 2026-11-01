/** Предыдущий календарный день, 18:00 по Москве. Пояс не зависит от сервера. */
export function changeDeadline(startsAt: Date | string): Date {
  const day = new Date(new Date(startsAt).getTime() + 3 * 60 * 60_000).toISOString().slice(0, 10);
  return new Date(new Date(`${day}T18:00:00+03:00`).getTime() - 24 * 60 * 60_000);
}

export function canReschedule(startsAt: Date | string, used: number, now = new Date()): boolean {
  return used < 1 && now.getTime() <= changeDeadline(startsAt).getTime();
}

export function interviewPlace(slot: { location: string; room?: string | null }): string {
  return slot.room ? `${slot.location}, аудитория ${slot.room}` : `${slot.location} — аудиторию сообщим дополнительно`;
}

/** Один общий замок расписания и записи: защищает и место, и доступность мастера. */
export const BOOKING_LOCK = 918_274;
