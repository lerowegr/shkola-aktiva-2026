<script setup lang="ts">
import { useElementSize } from "@vueuse/core";

/**
 * Сколько работ набрали каждый итог: столбик на каждый балл от 0 до
 * максимума. Подписан только самый высокий столбик и линия среднего —
 * остальное в подсказке и в таблице.
 */
const props = defineProps<{
  counts: number[];
  mean: number | null;
  caption: string;
}>();

const HEIGHT = 200;
const PAD = { top: 22, right: 8, bottom: 26, left: 32 };

const box = ref<HTMLElement | null>(null);
const { width } = useElementSize(box);

const n = computed(() => props.counts.length);
const scale = computed(() => niceScale(Math.max(0, ...props.counts)));
const plotW = computed(() => Math.max(1, width.value - PAD.left - PAD.right));
const plotH = HEIGHT - PAD.top - PAD.bottom;
const band = computed(() => plotW.value / Math.max(1, n.value));
const barW = computed(() => Math.max(2, Math.min(24, band.value - 2)));

const center = (i: number) => PAD.left + band.value * (i + 0.5);
const y = (value: number) => PAD.top + plotH - (value / scale.value.max) * plotH;
const peak = computed(() => props.counts.indexOf(Math.max(...props.counts)));

const xTicks = computed(() => {
  const every = Math.max(1, Math.ceil(22 / band.value));
  return props.counts.map((_, i) => i).filter((i) => i % every === 0 || i === n.value - 1);
});

const active = ref<number | null>(null);
function onKey(event: KeyboardEvent) {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  event.preventDefault();
  const step = event.key === "ArrowLeft" ? -1 : 1;
  active.value = Math.min(n.value - 1, Math.max(0, (active.value ?? peak.value) + step));
}
const tipStyle = computed(() => {
  if (active.value === null) return {};
  const at = center(active.value);
  return at > width.value / 2 ? { right: `${width.value - at + 14}px` } : { left: `${at + 14}px` };
});

const total = computed(() => props.counts.reduce((a, b) => a + b, 0));
const showTable = ref(false);
</script>

<template>
  <div class="flex flex-col gap-3">
    <div ref="box" class="relative" :style="{ height: `${HEIGHT}px` }">
      <svg
        v-if="width"
        :width="width"
        :height="HEIGHT"
        class="focus-visible:ring-accent block rounded-lg outline-none focus-visible:ring-2"
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
            <line :x1="PAD.left" :x2="width - PAD.right" :y1="y(tick)" :y2="y(tick)" stroke="var(--color-line)" />
            <text :x="PAD.left - 8" :y="y(tick)" text-anchor="end" dominant-baseline="middle">{{ tick }}</text>
          </template>
          <text v-for="i in xTicks" :key="i" :x="center(i)" :y="HEIGHT - 8" text-anchor="middle">{{ i }}</text>
        </g>

        <template v-for="(count, i) in counts" :key="i">
          <path
            v-if="count > 0"
            :d="columnPath(center(i) - barW / 2, y(count), barW, PAD.top + plotH - y(count))"
            fill="var(--color-brand-blue)"
            :opacity="active === i ? 0.75 : 1"
          />
          <!-- Цель для указателя — вся полоса, а не только закрашенное. -->
          <rect
            :x="center(i) - band / 2"
            :y="PAD.top"
            :width="band"
            :height="plotH"
            fill="transparent"
            @pointerenter="active = i"
          />
        </template>

        <text
          v-if="counts[peak]"
          :x="center(peak)"
          :y="y(counts[peak] ?? 0) - 6"
          text-anchor="middle"
          class="fill-ink text-[11px] font-semibold tabular-nums"
        >
          {{ counts[peak] }}
        </text>

        <g v-if="mean !== null" class="pointer-events-none">
          <line
            :x1="center(mean)"
            :x2="center(mean)"
            :y1="PAD.top - 4"
            :y2="PAD.top + plotH"
            stroke="var(--color-ink)"
            stroke-width="1"
          />
          <text
            :x="center(mean)"
            :y="PAD.top - 8"
            :text-anchor="center(mean) > width * 0.75 ? 'end' : center(mean) < width * 0.25 ? 'start' : 'middle'"
            class="fill-ink text-[11px]"
          >
            среднее {{ formatScore(mean) }}
          </text>
        </g>
      </svg>

      <div
        v-if="active !== null"
        class="bg-card border-line pointer-events-none absolute top-6 z-10 rounded-xl border px-3 py-2 text-xs whitespace-nowrap shadow-sm"
        :style="tipStyle"
      >
        <p class="text-ink-soft">Итог {{ active }} из {{ n - 1 }}</p>
        <p>
          <strong class="text-sm font-semibold tabular-nums">{{ counts[active] }}</strong>
          <span class="text-ink-soft"> {{ plural(counts[active] ?? 0, ["работа", "работы", "работ"]) }}</span>
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
            <th class="px-3 py-2 font-normal">Итог</th>
            <th class="px-3 py-2 text-right font-normal">Работ</th>
            <th class="px-3 py-2 text-right font-normal">Доля</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(count, i) in counts" :key="i" class="border-line border-t">
            <td class="px-3 py-1.5">{{ i }}</td>
            <td class="px-3 py-1.5 text-right">{{ count }}</td>
            <td class="px-3 py-1.5 text-right">{{ percentOf(count, total) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
