<script setup lang="ts">
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-vue-next";

import {
  formatDate,
  formatDateTime,
  monthGrid,
  monthName,
  parseDate,
  parseDateTime,
  shiftMonth,
  WEEKDAYS,
} from "~/utils/calendar";

/**
 * Дата и время в стиле брендбука: свой календарь и свои часы вместо
 * нативного попапа. Значение — та же строка, что у datetime-local
 * («2026-10-09T12:30», московское стенное время) или «2026-10-09»
 * в режиме date, поэтому замена — один в один.
 */
const props = withDefaults(
  defineProps<{
    label?: string;
    disabled?: boolean;
    mode?: "datetime" | "date";
    size?: "lg" | "md";
  }>(),
  { label: undefined, disabled: false, mode: "datetime", size: "lg" },
);

const model = defineModel<string>({ default: "" });
const id = useId();

function moscowToday(): { year: number; month: number; day: number } {
  const [year, month, day] = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date())
    .split("-")
    .map(Number) as [number, number, number];
  const parsed = parseDate(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  return parsed ?? { year, month: month - 1, day };
}

function selected() {
  return props.mode === "date" ? parseDate(model.value) : parseDateTime(model.value);
}

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const view = ref({ year: 2026, month: 9 });
const hoursBox = ref<HTMLElement | null>(null);
const minutesBox = ref<HTMLElement | null>(null);

const grid = computed(() => monthGrid(view.value.year, view.value.month));

/** Выбранный день и выбранное время — отдельно, чтобы типы сходились. */
const pickedDay = computed(() => {
  const current = selected();
  return current ? { year: current.year, month: current.month, day: current.day } : null;
});
const pickedTime = computed(() => {
  const current = selected();
  if (!current || !isDateTime(current)) return null;
  return { hour: current.hour, minute: current.minute };
});

function isDateTime(value: unknown): value is { hour: number; minute: number } {
  return typeof value === "object" && value !== null && "hour" in value;
}

function shortMonth(month: number): string {
  return new Intl.DateTimeFormat("ru-RU", { month: "short" }).format(new Date(2026, month, 1)).replace(".", "");
}

const text = computed(() => {
  const day = pickedDay.value;
  if (!day) return "";
  const date = `${day.day} ${shortMonth(day.month)} ${day.year}`;
  const time = pickedTime.value;
  if (props.mode === "date" || !time) return date;
  return `${date}, ${pad(time.hour)}:${pad(time.minute)}`;
});

function syncView() {
  const day = pickedDay.value;
  const today = moscowToday();
  view.value = day ? { year: day.year, month: day.month } : { year: today.year, month: today.month };
}

function toggle() {
  if (props.disabled) return;
  open.value = !open.value;
  if (open.value) {
    syncView();
    nextTick(scrollActive);
  }
}

function close() {
  open.value = false;
}

function scrollActive() {
  for (const box of [hoursBox.value, minutesBox.value]) {
    box?.querySelector("[data-active='true']")?.scrollIntoView({ block: "nearest" });
  }
}

function pickDay(cell: { year: number; month: number; day: number }) {
  if (props.mode === "date") {
    model.value = formatDate(cell);
    close();
    return;
  }
  const current = parseDateTime(model.value);
  const time = current ?? { ...moscowToday(), ...moscowTime() };
  model.value = formatDateTime({ ...cell, hour: time.hour, minute: time.minute });
}

function moscowTime(): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hour12: false })
    .format(new Date())
    .split(/[:,\s]/)
    .map(Number) as [number, number];
  // Полночь en-CA отдаёт как 24:xx — приводим к 0.
  return { hour: (parts[0] ?? 12) % 24, minute: parts[1] ?? 0 };
}

function pickTime(hour: number | null, minute: number | null) {
  const current = parseDateTime(model.value);
  const day = current ?? { ...moscowToday(), hour: 12, minute: 0 };
  model.value = formatDateTime({
    ...day,
    hour: hour ?? day.hour,
    minute: minute ?? day.minute,
  });
  nextTick(scrollActive);
}

function clear() {
  model.value = "";
}

function onPointerDown(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) close();
}

function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") close();
}

onMounted(() => {
  document.addEventListener("pointerdown", onPointerDown);
  document.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onPointerDown);
  document.removeEventListener("keydown", onKey);
});

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute);
const pad = (value: number) => String(value).padStart(2, "0");
</script>

<template>
  <div ref="root" class="flex min-w-0 flex-col gap-1.5">
    <label v-if="label" :for="id" class="text-sm font-medium">{{ label }}</label>
    <div class="relative">
      <button
        :id="id"
        type="button"
        :disabled="disabled"
        class="border-line bg-card focus:border-accent focus:ring-accent/20 flex w-full items-center gap-2.5 border text-left outline-none focus:ring-4 disabled:opacity-60"
        :class="[
          size === 'lg' ? 'min-h-12 rounded-2xl px-4 text-base' : 'min-h-11 rounded-xl px-3 text-base',
          text ? 'pr-11' : '',
        ]"
        @click="toggle()"
      >
        <CalendarDays class="text-ink-soft size-5 shrink-0" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate" :class="text ? '' : 'text-ink-soft/60'">
          {{ text || (mode === "date" ? "Выберите дату" : "Выберите дату и время") }}
        </span>
      </button>
      <button
        v-if="text && !disabled"
        type="button"
        aria-label="Очистить"
        class="text-ink-soft hover:text-ink absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full"
        @click="clear"
      >
        <X class="size-4" aria-hidden="true" />
      </button>

      <div
        v-if="open"
        class="bg-card border-line absolute top-full right-0 left-0 z-30 mt-2 rounded-2xl border p-3 shadow-xl sm:right-auto sm:w-72"
        role="dialog"
        aria-label="Выбор даты"
      >
        <div class="mb-2 flex items-center justify-between">
          <button type="button" class="hover:bg-paper grid size-9 place-items-center rounded-xl" aria-label="Прошлый месяц" @click="view = shiftMonth(view.year, view.month, -1)">
            <ChevronLeft class="size-5" aria-hidden="true" />
          </button>
          <p class="text-sm font-semibold first-letter:uppercase">{{ monthName(view.year, view.month) }}</p>
          <button type="button" class="hover:bg-paper grid size-9 place-items-center rounded-xl" aria-label="Следующий месяц" @click="view = shiftMonth(view.year, view.month, 1)">
            <ChevronRight class="size-5" aria-hidden="true" />
          </button>
        </div>
        <div class="grid grid-cols-7 gap-0.5" role="grid" aria-label="Дни месяца">
          <span v-for="name in WEEKDAYS" :key="name" class="text-ink-soft py-1 text-center text-xs">{{ name }}</span>
          <button
            v-for="cell in grid"
            :key="`${cell.year}-${cell.month}-${cell.day}`"
            type="button"
            class="grid size-9 place-items-center rounded-full text-sm tabular-nums transition"
            :class="[
              pickedDay && cell.year === pickedDay.year && cell.month === pickedDay.month && cell.day === pickedDay.day
                ? 'bg-accent font-semibold text-white'
                : 'hover:bg-paper',
              cell.current ? '' : 'opacity-40',
            ]"
            @click="pickDay(cell)"
          >
            {{ cell.day }}
          </button>
        </div>
        <div v-if="mode === 'datetime'" class="border-line mt-2 grid grid-cols-2 gap-2 border-t pt-2">
          <div ref="hoursBox" class="bg-paper max-h-36 overflow-y-auto rounded-xl p-1" role="listbox" aria-label="Часы">
            <button
              v-for="hour in HOURS"
              :key="hour"
              type="button"
              role="option"
              :aria-selected="pickedTime?.hour === hour"
              :data-active="pickedTime?.hour === hour"
              class="block w-full rounded-lg px-2 py-1 text-center text-sm tabular-nums"
              :class="pickedTime?.hour === hour ? 'bg-accent font-semibold text-white' : 'hover:bg-card'"
              @click="pickTime(hour, null)"
            >
              {{ pad(hour) }}
            </button>
          </div>
          <div ref="minutesBox" class="bg-paper max-h-36 overflow-y-auto rounded-xl p-1" role="listbox" aria-label="Минуты">
            <button
              v-for="minute in MINUTES"
              :key="minute"
              type="button"
              role="option"
              :aria-selected="pickedTime?.minute === minute"
              :data-active="pickedTime?.minute === minute"
              class="block w-full rounded-lg px-2 py-1 text-center text-sm tabular-nums"
              :class="pickedTime?.minute === minute ? 'bg-accent font-semibold text-white' : 'hover:bg-card'"
              @click="pickTime(null, minute)"
            >
              {{ pad(minute) }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
