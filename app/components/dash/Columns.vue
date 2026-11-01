<script setup lang="ts">
import { useElementSize } from "@vueuse/core";

/**
 * Столбики по дням, составные: каждый день — стопка из нескольких величин.
 * Подписан итог столбика, состав — в подсказке и таблице. С клавиатуры —
 * стрелками.
 */
const props = defineProps<{
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
  caption: string;
}>();

const HEIGHT = 220;
const PAD = { top: 22, right: 12, bottom: 28, left: 32 };

const box = ref<HTMLElement | null>(null);
const { width } = useElementSize(box);

const n = computed(() => props.labels.length);
const totals = computed(() =>
  props.series.map((item) =>
    item.values.reduce((sum, value) => sum + value, 0),
  ),
);
const scale = computed(() =>
  niceScale(
    Math.max(
      0,
      ...props.labels.map((_, i) =>
        props.series.reduce((sum, item) => sum + (item.values[i] ?? 0), 0),
      ),
    ),
  ),
);
const plotW = computed(() => Math.max(1, width.value - PAD.left - PAD.right));
const plotH = HEIGHT - PAD.top - PAD.bottom;
const band = computed(() => plotW.value / Math.max(1, n.value));
const barW = computed(() => Math.max(2, Math.min(36, band.value - 6)));
const center = (i: number) => PAD.left + band.value * (i + 0.5);
const y = (value: number) =>
  PAD.top + plotH - (value / scale.value.max) * plotH;

interface Segment {
  x: number;
  width: number;
  y: number;
  height: number;
  color: string;
  name: string;
  value: number;
  top: boolean;
}

const columns = computed(() =>
  props.labels.map((_, i) => {
    const values = props.series.map((item) => item.values[i] ?? 0);
    const topIndex = values.reduce(
      (last, value, index) => (value > 0 ? index : last),
      -1,
    );
    let base = PAD.top + plotH;
    const segments: Segment[] = [];

    props.series.forEach((item, j) => {
      const value = values[j] ?? 0;
      if (value <= 0) return;
      const height = (value / scale.value.max) * plotH;
      const top = base - height;
      segments.push({
        x: center(i) - barW.value / 2,
        width: barW.value,
        y: top,
        height,
        color: item.color,
        name: item.name,
        value,
        top: j === topIndex,
      });
      base = top;
    });

    return { segments, total: values.reduce((sum, value) => sum + value, 0) };
  }),
);

const peak = computed(() => {
  const values = columns.value.map((column) => column.total);
  return values.indexOf(Math.max(...values));
});

const xTicks = computed(() => {
  const every = Math.max(1, Math.ceil(34 / band.value));
  return props.labels
    .map((_, i) => i)
    .filter((i) => i % every === 0 || i === n.value - 1);
});

const active = ref<number | null>(null);
watch(() => props.labels, () => { active.value = null; });
function onKey(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const step = event.key === "ArrowLeft" ? -1 : 1;
  active.value = Math.min(
    n.value - 1,
    Math.max(0, (active.value ?? peak.value) + step),
  );
}
const tipStyle = computed(() => {
  if (active.value === null) return {};
  const at = center(active.value);
  return at > width.value / 2
    ? { right: `${width.value - at + 14}px` }
    : { left: `${at + 14}px` };
});

const showTable = ref(false);
</script>

<template>
  <div class="flex min-w-0 flex-col gap-3">
    <ul class="flex flex-wrap gap-x-5 gap-y-1 text-sm">
      <li
        v-for="(item, i) in series"
        :key="item.name"
        class="flex items-center gap-2"
      >
        <span
          class="size-2.5 rounded-sm"
          :style="{ background: item.color }"
          aria-hidden="true"
        />
        <span>{{ item.name }}</span>
        <span class="text-ink-soft tabular-nums"
          >· {{ formatCount(totals[i] ?? 0) }}</span
        >
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
        @pointerleave="active = null"
        @focus="active = peak"
        @blur="active = null"
        @keydown="onKey"
      >
        <g class="fill-ink-soft text-[11px] tabular-nums">
          <template v-for="tick in scale.ticks" :key="tick">
            <line
              :x1="PAD.left"
              :x2="width - PAD.right"
              :y1="y(tick)"
              :y2="y(tick)"
              stroke="var(--color-line)"
            />
            <text
              :x="PAD.left - 8"
              :y="y(tick)"
              text-anchor="end"
              dominant-baseline="middle"
            >
              {{ formatCount(tick) }}
            </text>
          </template>
          <text
            v-for="i in xTicks"
            :key="i"
            :x="center(i)"
            :y="HEIGHT - 8"
            :text-anchor="i === n - 1 ? 'end' : 'middle'"
          >
            {{ labels[i] }}
          </text>
        </g>

        <g v-for="(column, i) in columns" :key="i">
          <template v-for="(segment, j) in column.segments" :key="j">
            <path
              v-if="segment.top"
              :d="
                columnPath(segment.x, segment.y, segment.width, segment.height)
              "
              :fill="segment.color"
              :opacity="active === i ? 0.75 : 1"
            />
            <rect
              v-else
              :x="segment.x"
              :y="segment.y"
              :width="segment.width"
              :height="segment.height"
              :fill="segment.color"
              :opacity="active === i ? 0.75 : 1"
            />
          </template>

          <text
            v-if="column.total && band >= 34"
            :x="center(i)"
            :y="PAD.top + plotH - (column.total / scale.max) * plotH - 6"
            text-anchor="middle"
            class="fill-ink text-[11px] font-semibold tabular-nums"
          >
            {{ column.total }}
          </text>

          <!-- Цель для указателя — вся полоса, а не только закрашенное. -->
          <rect
            :x="center(i) - band / 2"
            :y="PAD.top"
            :width="band"
            :height="plotH"
            fill="transparent"
            @pointerenter="active = i"
          />
        </g>
      </svg>

      <div
        v-if="active !== null"
        class="bg-card border-line pointer-events-none absolute top-1 z-10 flex flex-col gap-1 rounded-xl border px-3 py-2 text-xs whitespace-nowrap shadow-sm"
        :style="tipStyle"
      >
        <p class="text-ink-soft">{{ labels[active] }}</p>
        <p
          v-for="item in series"
          :key="item.name"
          class="flex items-center gap-2"
        >
          <span
            class="size-2 rounded-sm"
            :style="{ background: item.color }"
            aria-hidden="true"
          />
          <strong class="text-sm font-semibold tabular-nums">{{
            formatCount(item.values[active] ?? 0)
          }}</strong>
          <span class="text-ink-soft">{{ item.name }}</span>
        </p>
      </div>
    </div>

    <button
      type="button"
      class="text-accent self-start text-sm hover:underline"
      @click="showTable = !showTable"
    >
      {{ showTable ? "Скрыть таблицу" : "Показать таблицей" }}
    </button>
    <div
      v-if="showTable"
      class="border-line max-h-72 overflow-auto rounded-xl border"
    >
      <table class="w-full text-sm tabular-nums">
        <thead class="bg-paper text-ink-soft sticky top-0 text-left">
          <tr>
            <th class="px-3 py-2 font-normal">День</th>
            <th
              v-for="item in series"
              :key="item.name"
              class="px-3 py-2 text-right font-normal"
            >
              {{ item.name }}
            </th>
            <th class="px-3 py-2 text-right font-normal">Всего</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(label, i) in labels"
            :key="label"
            class="border-line border-t"
          >
            <td class="px-3 py-1.5">{{ label }}</td>
            <td
              v-for="item in series"
              :key="item.name"
              class="px-3 py-1.5 text-right"
            >
              {{ formatCount(item.values[i] ?? 0) }}
            </td>
            <td class="px-3 py-1.5 text-right font-semibold">
              {{ formatCount(columns[i]?.total ?? 0) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
