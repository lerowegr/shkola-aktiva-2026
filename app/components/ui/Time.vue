<script setup lang="ts">
import { Clock, X } from "lucide-vue-next";

import { formatTime, parseTime } from "~/utils/calendar";

/**
 * Время в стиле брендбука: две колонки (часы, минуты) вместо нативного
 * барабана. Значение — та же строка «HH:mm», замена один в один.
 */
withDefaults(defineProps<{ label?: string; disabled?: boolean }>(), {
  label: undefined,
  disabled: false,
});

const model = defineModel<string>({ default: "" });
const id = useId();

const open = ref(false);
const root = ref<HTMLElement | null>(null);
const hoursBox = ref<HTMLElement | null>(null);
const minutesBox = ref<HTMLElement | null>(null);

const picked = computed(() => parseTime(model.value));
const text = computed(() => {
  const current = picked.value;
  return current ? formatTime(current) : "";
});

function toggle() {
  open.value = !open.value;
  if (open.value) nextTick(scrollActive);
}

function close() {
  open.value = false;
}

function scrollActive() {
  for (const box of [hoursBox.value, minutesBox.value]) {
    box?.querySelector("[data-active='true']")?.scrollIntoView({ block: "nearest" });
  }
}

function pick(hour: number | null, minute: number | null) {
  const current = picked.value ?? { hour: 12, minute: 0 };
  model.value = formatTime({ hour: hour ?? current.hour, minute: minute ?? current.minute });
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
        class="border-line bg-card focus:border-accent focus:ring-accent/20 flex min-h-11 w-full items-center gap-2.5 rounded-xl border px-3 text-base outline-none focus:ring-4 disabled:opacity-60"
        :class="text ? 'pr-11' : ''"
        @click="toggle()"
      >
        <Clock class="text-ink-soft size-5 shrink-0" aria-hidden="true" />
        <span class="min-w-0 flex-1 truncate text-left tabular-nums" :class="text ? '' : 'text-ink-soft/60'">
          {{ text || "––:––" }}
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
        class="bg-card border-line absolute top-full right-0 left-0 z-30 mt-2 grid grid-cols-2 gap-2 rounded-2xl border p-3 shadow-xl sm:right-auto sm:w-64"
        role="dialog"
        aria-label="Выбор времени"
      >
        <div ref="hoursBox" class="bg-paper max-h-44 overflow-y-auto rounded-xl p-1" role="listbox" aria-label="Часы">
          <button
            v-for="hour in HOURS"
            :key="hour"
            type="button"
            role="option"
            :aria-selected="picked?.hour === hour"
            :data-active="picked?.hour === hour"
            class="block w-full rounded-lg px-2 py-1 text-center text-sm tabular-nums"
            :class="picked?.hour === hour ? 'bg-accent font-semibold text-white' : 'hover:bg-card'"
            @click="pick(hour, null)"
          >
            {{ pad(hour) }}
          </button>
        </div>
        <div ref="minutesBox" class="bg-paper max-h-44 overflow-y-auto rounded-xl p-1" role="listbox" aria-label="Минуты">
          <button
            v-for="minute in MINUTES"
            :key="minute"
            type="button"
            role="option"
            :aria-selected="picked?.minute === minute"
            :data-active="picked?.minute === minute"
            class="block w-full rounded-lg px-2 py-1 text-center text-sm tabular-nums"
            :class="picked?.minute === minute ? 'bg-accent font-semibold text-white' : 'hover:bg-card'"
            @click="pick(null, minute)"
          >
            {{ pad(minute) }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
