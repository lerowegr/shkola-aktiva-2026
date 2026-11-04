<script setup lang="ts">
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-vue-next";

/**
 * Свой выбор даты вместо системного календаря: сетка месяца в стиле
 * бренда, выбор дня закрывает попап. Значение — строка YYYY-MM-DD,
 * пустая строка — дата не выбрана.
 */
const props = withDefaults(
  defineProps<{
    label?: string;
    ariaLabel?: string;
    /** Подпись, когда дата не выбрана. */
    placeholder?: string;
    size?: "md" | "sm";
  }>(),
  { label: undefined, ariaLabel: undefined, placeholder: "Дата", size: "sm" },
);

const model = defineModel<string>({ default: "" });
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const month = ref(startOfMonth(new Date()));

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

const monthTitle = computed(() =>
  month.value.toLocaleDateString("ru-RU", { month: "long", year: "numeric" }),
);

interface DayCell {
  key: string;
  day: number;
  value: string; // YYYY-MM-DD
  inMonth: boolean;
  isToday: boolean;
  selected: boolean;
}

const weekdays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const cells = computed<DayCell[]>(() => {
  const first = month.value;
  // Сдвиг к понедельнику: 0 — воскресенье, 6 — суббота.
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - offset);
  const todayKey = new Intl.DateTimeFormat("en-CA").format(new Date());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + index);
    const value = new Intl.DateTimeFormat("en-CA").format(date);
    return {
      key: value,
      day: date.getDate(),
      value,
      inMonth: date.getMonth() === first.getMonth(),
      isToday: value === todayKey,
      selected: value === model.value,
    };
  });
});

function toggle() {
  if (!open.value) {
    month.value = model.value
      ? startOfMonth(new Date(`${model.value}T12:00:00`))
      : startOfMonth(new Date());
  }
  open.value = !open.value;
}
function shiftMonth(step: number) {
  month.value = new Date(month.value.getFullYear(), month.value.getMonth() + step, 1);
}
function pick(cell: DayCell) {
  model.value = cell.value;
  open.value = false;
}
function clear() {
  model.value = "";
  open.value = false;
}

function onOutside(event: PointerEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener("pointerdown", onOutside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", onOutside));

const display = computed(() => {
  if (!model.value) return props.placeholder;
  const [y, m, d] = model.value.split("-");
  return `${d}.${m}.${y}`;
});
const SIZES = {
  md: "min-h-11 rounded-xl px-3 text-sm",
  sm: "min-h-10 rounded-xl px-3 text-sm",
} as const;
</script>

<template>
  <div ref="root" class="relative flex min-w-0 flex-col gap-1.5">
    <label v-if="label" class="text-sm font-medium">{{ label }}</label>
    <button
      type="button"
      class="border-line bg-card hover:border-ink-soft focus-visible:ring-accent/20 inline-flex min-w-0 items-center gap-2 border outline-none focus-visible:ring-4"
      :class="[SIZES[props.size], open ? 'border-accent' : '']"
      :aria-expanded="open"
      :aria-label="ariaLabel ?? label"
      @click="toggle"
      @keydown.esc="open = false"
    >
      <Calendar class="text-ink-soft size-4 shrink-0" aria-hidden="true" />
      <span class="truncate" :class="model ? '' : 'text-ink-soft'">{{ display }}</span>
      <button
        v-if="model"
        type="button"
        class="text-ink-soft hover:text-ink -mr-1 rounded-md p-0.5"
        aria-label="Очистить дату"
        @click.stop="clear"
      >
        <X class="size-4" aria-hidden="true" />
      </button>
      <ChevronDown v-else class="text-ink-soft ml-auto size-4 shrink-0" aria-hidden="true" />
    </button>

    <Transition name="tip">
      <div
        v-if="open"
        class="bg-card border-line absolute top-full left-0 z-40 mt-1 w-72 rounded-2xl border p-3 shadow-lg"
        role="dialog"
        :aria-label="ariaLabel ?? 'Выбор даты'"
      >
        <div class="flex items-center justify-between gap-2">
          <p class="text-sm font-semibold capitalize">{{ monthTitle }}</p>
          <div class="flex gap-1">
            <button type="button" class="border-line hover:border-ink-soft rounded-lg border p-1" aria-label="Предыдущий месяц" @click="shiftMonth(-1)">
              <ChevronLeft class="size-4" aria-hidden="true" />
            </button>
            <button type="button" class="border-line hover:border-ink-soft rounded-lg border p-1" aria-label="Следующий месяц" @click="shiftMonth(1)">
              <ChevronRight class="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
        <div class="mt-2 grid grid-cols-7 gap-0.5 text-center">
          <span v-for="day in weekdays" :key="day" class="text-ink-soft py-1 text-xs">{{ day }}</span>
          <button
            v-for="cell in cells"
            :key="cell.key"
            type="button"
            class="rounded-lg py-1.5 text-sm tabular-nums outline-none focus-visible:ring-accent/40 focus-visible:ring-2"
            :class="[
              cell.selected ? 'bg-ink text-paper font-semibold' : cell.inMonth ? 'hover:bg-paper' : 'text-ink-soft/60',
              cell.isToday && !cell.selected ? 'ring-accent ring-1' : '',
            ]"
            :aria-pressed="cell.selected"
            @click="pick(cell)"
          >
            {{ cell.day }}
          </button>
        </div>
        <div class="border-line mt-2 flex justify-between border-t pt-2">
          <button type="button" class="text-ink-soft hover:text-ink text-sm" @click="clear">Очистить</button>
          <button type="button" class="text-accent text-sm hover:underline" @click="open = false">Готово</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .tip-enter-active,
  .tip-leave-active {
    transition:
      opacity 0.14s ease,
      transform 0.14s cubic-bezier(0.2, 0, 0, 1);
  }
  .tip-enter-from,
  .tip-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
