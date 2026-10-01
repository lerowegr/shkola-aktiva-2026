<script setup lang="ts">
/**
 * Горизонтальные столбики с подписями: воронка и разрезы.
 * Одна величина — один цвет; значение и доля написаны у каждого столбика,
 * подсказка на наведении добавляет то, что не влезло в строку.
 */
const props = defineProps<{
  rows: { label: string; value: number; share?: string; hint?: string }[];
}>();

const max = computed(() => Math.max(1, ...props.rows.map((row) => row.value)));
</script>

<template>
  <ul class="flex flex-col gap-3">
    <li
      v-for="row in rows"
      :key="row.label"
      class="group relative flex flex-col gap-1.5 rounded-lg outline-none"
      :tabindex="row.hint ? 0 : undefined"
    >
      <div class="flex items-baseline justify-between gap-3 text-sm">
        <span class="min-w-0">{{ row.label }}</span>
        <span class="shrink-0 tabular-nums">
          <strong class="font-semibold">{{ formatCount(row.value) }}</strong>
          <span v-if="row.share" class="text-ink-soft"> · {{ row.share }}</span>
        </span>
      </div>
      <div class="h-3">
        <div
          class="bg-brand-blue h-full rounded-r-[4px] transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80"
          :style="{ width: row.value ? `max(2px, ${(row.value / max) * 100}%)` : '0' }"
        />
      </div>
      <p
        v-if="row.hint"
        class="bg-card border-line pointer-events-none absolute right-0 bottom-full z-10 mb-1 hidden rounded-xl border px-3 py-2 text-xs shadow-sm group-hover:block group-focus-visible:block"
      >
        {{ row.hint }}
      </p>
    </li>
  </ul>
</template>
