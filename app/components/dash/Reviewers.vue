<script setup lang="ts">
import type { ReviewerStats } from "~~/lib/dashboards";

/**
 * Мастера этапа: сколько проверили из назначенного и насколько их средний
 * итог отходит от общего. Отклонение — расходящаяся шкала от серой
 * середины: влево — строже остальных, вправо — мягче.
 */
const props = defineProps<{ reviewers: ReviewerStats[]; overall: number | null; max: number }>();

const spread = computed(() =>
  Math.max(
    0.5,
    ...props.reviewers.map((row) =>
      row.average !== null && props.overall !== null ? Math.abs(row.average - props.overall) : 0,
    ),
  ),
);

function delta(row: ReviewerStats): number | null {
  if (row.average === null || props.overall === null) return null;
  return Math.round((row.average - props.overall) * 10) / 10;
}

function hint(row: ReviewerStats): string {
  const value = delta(row);
  if (value === null || row.average === null) return "Пока нет полностью проверенных работ";
  if (value === 0) return `Средний итог ${formatScore(row.average)} из ${props.max} — как у всех`;
  return `Средний итог ${formatScore(row.average)} из ${props.max} — на ${formatScore(Math.abs(value))} ${
    value < 0 ? "ниже" : "выше"
  } общего (${formatScore(props.overall ?? 0)})`;
}
</script>

<template>
  <div class="flex flex-col">
    <div
      class="text-ink-soft hidden gap-4 pb-2 text-xs sm:grid sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)]"
    >
      <span>Мастер</span>
      <span>Проверено</span>
      <span class="flex justify-between"><span>← строже</span><span>Средний итог</span><span>мягче →</span></span>
    </div>

    <p class="text-ink-soft flex justify-between pb-2 text-xs sm:hidden">
      <span>Средний итог: ← строже</span><span>мягче →</span>
    </p>

    <div
      v-for="row in reviewers"
      :key="row.id"
      class="border-line grid gap-x-4 gap-y-2 border-t py-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)] sm:items-center"
    >
      <p class="truncate text-sm font-medium">{{ row.name }}</p>

      <div class="flex items-center gap-3">
        <div class="bg-accent/15 h-2 flex-1 overflow-hidden rounded-full">
          <div
            class="bg-accent h-full rounded-full"
            :style="{ width: `${row.assigned ? (row.done / row.assigned) * 100 : 0}%` }"
          />
        </div>
        <span class="shrink-0 text-sm tabular-nums">
          {{ row.done }}<span class="text-ink-soft"> из {{ row.assigned }}</span>
        </span>
      </div>

      <div class="group relative flex items-center gap-3 outline-none" tabindex="0">
        <div class="relative h-3 flex-1">
          <span class="bg-ink-soft/70 absolute -inset-y-1 left-1/2 w-px" aria-hidden="true" />
          <span
            v-if="delta(row)"
            class="absolute inset-y-0 transition-opacity group-hover:opacity-80"
            :class="(delta(row) ?? 0) < 0 ? 'bg-brand-orange right-1/2 rounded-l-[4px]' : 'bg-brand-blue left-1/2 rounded-r-[4px]'"
            :style="{ width: `${(Math.abs(delta(row) ?? 0) / spread) * 50}%` }"
          />
        </div>
        <span class="flex w-24 shrink-0 items-baseline justify-end gap-1.5 text-sm tabular-nums">
          <template v-if="row.average !== null">
            <strong class="font-semibold">{{ formatScore(row.average) }}</strong>
            <span v-if="delta(row)" class="text-ink-soft">{{ formatDelta(delta(row) ?? 0) }}</span>
          </template>
          <span v-else class="text-ink-soft">—</span>
        </span>
        <p
          class="bg-card border-line pointer-events-none absolute right-0 bottom-full z-10 mb-1 hidden rounded-xl border px-3 py-2 text-xs shadow-sm group-hover:block group-focus-visible:block"
        >
          {{ hint(row) }}
        </p>
      </div>
    </div>
  </div>
</template>
