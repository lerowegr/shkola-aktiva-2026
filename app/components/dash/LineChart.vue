<script setup lang="ts">
import { useElementSize } from "@vueuse/core";

/**
 * Линии по дням. Одна ось на все линии; перекрестие находит ближайший день,
 * подсказка перечисляет все линии сразу. С клавиатуры — стрелками.
 * Под графиком — те же числа таблицей.
 */
const props = defineProps<{
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
  caption: string;
}>();

const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 28, left: 36 };

const box = ref<HTMLElement | null>(null);
const { width } = useElementSize(box);

const n = computed(() => props.labels.length);
const scale = computed(() => niceScale(Math.max(0, ...props.series.flatMap((item) => item.values))));
const plotW = computed(() => Math.max(1, width.value - PAD.left - PAD.right));
const plotH = HEIGHT - PAD.top - PAD.bottom;

const x = (i: number) => PAD.left + (n.value <= 1 ? plotW.value / 2 : (i / (n.value - 1)) * plotW.value);
const y = (value: number) => PAD.top + plotH - (value / scale.value.max) * plotH;

const paths = computed(() =>
  props.series.map((item) =>
    item.values.map((value, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(value).toFixed(1)}`).join(""),
  ),
);

// Подписи дней — не чаще, чем раз в 64px, и последняя всегда видна.
const xTicks = computed(() => {
  const gap = n.value > 1 ? plotW.value / (n.value - 1) : plotW.value;
  const every = Math.max(1, Math.ceil(64 / gap));
  return props.labels.map((label, i) => ({ label, i })).filter(({ i }) => (n.value - 1 - i) % every === 0);
});

const totals = computed(() => props.series.map((item) => item.values.reduce((a, b) => a + b, 0)));

const active = ref<number | null>(null);
function onMove(event: PointerEvent) {
  const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
  const position = (event.clientX - rect.left - PAD.left) / plotW.value;
  active.value = Math.min(n.value - 1, Math.max(0, Math.round(position * (n.value - 1))));
}
function onKey(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const step = event.key === "ArrowLeft" ? -1 : 1;
  active.value = Math.min(n.value - 1, Math.max(0, (active.value ?? n.value - 1) + step));
}

const tipX = computed(() => (active.value === null ? 0 : x(active.value)));
const tipStyle = computed(() =>
  tipX.value > width.value / 2 ? { right: `${width.value - tipX.value + 10}px` } : { left: `${tipX.value + 10}px` },
);

const showTable = ref(false);
</script>

<template>
  <div class="flex flex-col gap-3">
    <ul class="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      <li v-for="(item, i) in series" :key="item.name" class="flex items-center gap-2">
        <span class="h-0.5 w-4 rounded-full" :style="{ background: item.color }" aria-hidden="true" />
        <span>{{ item.name }}</span>
        <span class="text-ink-soft tabular-nums">· {{ formatCount(totals[i] ?? 0) }}</span>
      </li>
    </ul>

    <div ref="box" class="relative" :style="{ height: `${HEIGHT}px` }">
      <svg
        v-if="width"
        :width="width"
        :height="HEIGHT"
        class="focus-visible:ring-accent block touch-pan-y rounded-lg outline-none focus-visible:ring-2"
        tabindex="0"
        role="img"
        :aria-label="caption"
        @pointermove="onMove"
        @pointerleave="active = null"
        @focus="active = n - 1"
        @blur="active = null"
        @keydown="onKey"
      >
        <g class="fill-ink-soft text-[11px] tabular-nums">
          <template v-for="tick in scale.ticks" :key="tick">
            <line :x1="PAD.left" :x2="width - PAD.right" :y1="y(tick)" :y2="y(tick)" stroke="var(--color-line)" />
            <text :x="PAD.left - 8" :y="y(tick)" text-anchor="end" dominant-baseline="middle">
              {{ formatCount(tick) }}
            </text>
          </template>
          <text
            v-for="tick in xTicks"
            :key="tick.i"
            :x="x(tick.i)"
            :y="HEIGHT - 8"
            :text-anchor="tick.i === n - 1 ? 'end' : 'middle'"
          >
            {{ tick.label }}
          </text>
        </g>

        <path
          v-for="(item, i) in series"
          :key="item.name"
          :d="paths[i]"
          fill="none"
          :stroke="item.color"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />

        <g v-if="active !== null">
          <line
            :x1="tipX"
            :x2="tipX"
            :y1="PAD.top"
            :y2="PAD.top + plotH"
            stroke="var(--color-ink-soft)"
            stroke-width="1"
          />
          <circle
            v-for="item in series"
            :key="item.name"
            :cx="tipX"
            :cy="y(item.values[active] ?? 0)"
            r="4"
            :fill="item.color"
            stroke="var(--color-card)"
            stroke-width="2"
          />
        </g>
      </svg>

      <div
        v-if="active !== null"
        class="bg-card border-line pointer-events-none absolute top-1 z-10 flex flex-col gap-1 rounded-xl border px-3 py-2 text-xs whitespace-nowrap shadow-sm"
        :style="tipStyle"
      >
        <p class="text-ink-soft">{{ labels[active] }}</p>
        <p v-for="item in series" :key="item.name" class="flex items-center gap-2">
          <span class="h-0.5 w-3 rounded-full" :style="{ background: item.color }" aria-hidden="true" />
          <strong class="text-sm font-semibold tabular-nums">{{ formatCount(item.values[active] ?? 0) }}</strong>
          <span class="text-ink-soft">{{ item.name }}</span>
        </p>
      </div>
    </div>

    <button type="button" class="text-accent self-start text-sm hover:underline" @click="showTable = !showTable">
      {{ showTable ? "Скрыть таблицу" : "Показать таблицей" }}
    </button>
    <div v-if="showTable" class="border-line max-h-72 overflow-auto rounded-xl border">
      <table class="w-full text-sm tabular-nums">
        <thead class="bg-paper text-ink-soft sticky top-0 text-left">
          <tr>
            <th class="px-3 py-2 font-normal">День</th>
            <th v-for="item in series" :key="item.name" class="px-3 py-2 text-right font-normal">{{ item.name }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(label, i) in labels" :key="label" class="border-line border-t">
            <td class="px-3 py-1.5">{{ label }}</td>
            <td v-for="item in series" :key="item.name" class="px-3 py-1.5 text-right">
              {{ formatCount(item.values[i] ?? 0) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
