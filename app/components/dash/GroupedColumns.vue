<script setup lang="ts">
import { useElementSize } from "@vueuse/core";

/**
 * Группы столбиков: у каждой подписи своя группа из нескольких серий
 * (например, этап × восемь факультетов). При наведении — подсказка со всеми
 * значениями группы; с клавиатуры — стрелками. Таблица — кнопкой ниже.
 */
const props = defineProps<{
  labels: string[];
  series: { name: string; color: string; values: number[] }[];
  caption: string;
  /** Подписывать значения над столбиками. */
  values?: boolean;
}>();

const HEIGHT = 220;
const PAD = { top: 20, right: 12, bottom: 34, left: 32 };

const box = ref<HTMLElement | null>(null);
const { width } = useElementSize(box);

const scale = computed(() => niceScale(Math.max(0, ...props.series.flatMap((item) => item.values))));
const plotW = computed(() => Math.max(1, width.value - PAD.left - PAD.right));
const plotH = HEIGHT - PAD.top - PAD.bottom;
const band = computed(() => plotW.value / Math.max(1, props.labels.length));
const groupW = computed(() => Math.min(band.value - 8, props.series.length * 22));
const barW = computed(() => Math.max(3, groupW.value / Math.max(1, props.series.length)));
const groupX = (i: number) => PAD.left + band.value * i + (band.value - groupW.value) / 2;
const y = (value: number) => PAD.top + plotH - (value / scale.value.max) * plotH;

const bars = computed(() =>
  props.labels.flatMap((label, i) =>
    props.series.map((item, j) => ({
      label,
      name: item.name,
      color: item.color,
      value: item.values[i] ?? 0,
      x: groupX(i) + barW.value * j,
      y: y(item.values[i] ?? 0),
      width: barW.value - 2,
      height: Math.max(0, PAD.top + plotH - y(item.values[i] ?? 0)),
    })),
  ),
);
const gridLines = computed(() => scale.value.ticks.map((tick) => ({ tick, y: y(tick) })));

const active = ref<number | null>(null);
const busiest = computed(() => {
  const totals = props.labels.map((_, i) => props.series.reduce((sum, item) => sum + (item.values[i] ?? 0), 0));
  return totals.indexOf(Math.max(...totals));
});
watch(() => props.labels, () => { active.value = null; });
function onKey(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const step = event.key === "ArrowLeft" ? -1 : 1;
  active.value = Math.min(props.labels.length - 1, Math.max(0, (active.value ?? busiest.value) + step));
}
const tipStyle = computed(() => {
  if (active.value === null) return {};
  const at = groupX(active.value) + groupW.value / 2;
  return at > width.value / 2
    ? { right: `${width.value - at + 14}px` }
    : { left: `${at + 14}px` };
});

const showTable = ref(false);
const tableColumns = computed(() => [
  { key: "label", label: "" },
  ...props.series.map((item) => ({ key: item.name, label: item.name })),
]);
const tableRows = computed(() =>
  props.labels.map((label, i) =>
    Object.fromEntries([
      ["label", label],
      ...props.series.map((item) => [item.name, item.values[i] ?? 0]),
    ]),
  ),
);
</script>

<template>
  <figure class="flex min-w-0 flex-col gap-2">
    <div ref="box" class="relative w-full" :style="{ height: `${HEIGHT}px` }">
      <svg
        v-if="width"
        :width="width"
        :height="HEIGHT"
        class="focus-visible:ring-accent block touch-pan-y rounded-lg outline-none focus-visible:ring-2"
        tabindex="0"
        role="img"
        :aria-label="caption"
        @pointerleave="active = null"
        @focus="active = busiest"
        @blur="active = null"
        @keydown="onKey"
      >
        <g>
          <line
            v-for="line in gridLines"
            :key="line.tick"
            x1="0"
            :x2="width"
            :y1="line.y"
            :y2="line.y"
            stroke="var(--color-line)"
            stroke-width="1"
          />
          <text :x="4" :y="y(scale.ticks.at(-1)!)" class="fill-current text-[10px] tabular-nums opacity-60">{{ scale.ticks.at(-1) }}</text>
        </g>
        <g>
          <rect
            v-for="(bar, index) in bars"
            :key="index"
            :x="bar.x"
            :y="bar.y"
            :width="bar.width"
            :height="bar.height"
            :fill="bar.color"
            :opacity="active === null || active === Math.floor(index / series.length) ? 1 : 0.4"
            rx="3"
          />
          <g v-if="values">
            <text
              v-for="(bar, index) in bars"
              :key="`t${index}`"
              :x="bar.x + bar.width / 2"
              :y="bar.y - 4"
              text-anchor="middle"
              class="fill-current text-[10px] tabular-nums"
            >{{ bar.value || "" }}</text>
          </g>
        </g>
        <g>
          <text
            v-for="(label, i) in labels"
            :key="label"
            :x="PAD.left + band * (i + 0.5)"
            :y="HEIGHT - 10"
            text-anchor="middle"
            :class="active === i ? 'fill-current font-semibold' : 'fill-current text-[11px]'"
          >{{ label }}</text>
        </g>
        <!-- Цель для указателя — вся полоса группы, а не только столбики. -->
        <g>
          <rect
            v-for="(label, i) in labels"
            :key="`band${i}`"
            :x="PAD.left + band * i"
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
        class="bg-card border-line pointer-events-none absolute top-1 z-10 flex max-w-64 flex-col gap-1 rounded-xl border px-3 py-2 text-xs whitespace-nowrap shadow-sm"
        :style="tipStyle"
      >
        <p class="text-ink-soft">{{ labels[active] }}</p>
        <p v-for="item in series" :key="item.name" class="flex items-center gap-2">
          <span class="size-2 rounded-sm" :style="{ background: item.color }" aria-hidden="true" />
          <strong class="text-sm font-semibold tabular-nums">{{ formatCount(item.values[active] ?? 0) }}</strong>
          <span class="text-ink-soft">{{ item.name }}</span>
        </p>
      </div>
    </div>

    <figcaption class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
      <span class="text-ink-soft">{{ caption }}</span>
      <span v-for="item in series" :key="item.name" class="inline-flex items-center gap-1.5">
        <span class="size-2.5 rounded-sm" :style="{ background: item.color }" aria-hidden="true" />
        {{ item.name }}
      </span>
    </figcaption>

    <button type="button" class="text-accent self-start text-xs hover:underline" @click="showTable = !showTable">
      {{ showTable ? "Скрыть таблицу" : "Показать таблицей" }}
    </button>
    <DashTable v-if="showTable" :columns="tableColumns" :rows="tableRows" />
  </figure>
</template>
