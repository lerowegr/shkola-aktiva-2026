<script setup lang="ts">
import { Check, Lock } from "lucide-vue-next";

import type { StageState } from "~~/lib/stages";

/**
 * Этапы отбора лентой: что прошло, что идёт, что впереди и когда.
 * Домашнее задание — часть анкеты, отдельным этапом его не показываем.
 */
const props = defineProps<{
  stages: {
    id: string;
    kind?: string;
    title: string;
    state: StageState;
    opensAt: string | Date | null;
    closesAt: string | Date | null;
  }[];
}>();

const shown = computed(() => props.stages.filter((stage) => stage.kind !== "HOMEWORK"));

const STATE_LABEL: Record<StageState, string> = {
  upcoming: "Скоро",
  open: "Идёт сейчас",
  closed: "Завершён",
};

function when(opensAt: string | Date | null, closesAt: string | Date | null): string {
  const day = (value: string | Date) => mskFormat(value, "d MMMM");
  if (opensAt && closesAt) return `${day(opensAt)} — ${day(closesAt)}`;
  if (opensAt) return `с ${day(opensAt)}`;
  return "Даты объявим";
}
</script>

<template>
  <ol class="flex flex-col gap-3">
    <li
      v-for="(stage, index) in shown"
      :key="stage.id"
      class="border-line bg-card flex items-center gap-4 rounded-2xl border p-4"
      :class="stage.state === 'open' && 'border-accent ring-accent/15 ring-4'"
    >
      <span
        class="grid size-10 shrink-0 place-items-center rounded-xl font-display text-sm"
        :class="{
          'bg-accent text-accent-ink': stage.state === 'open',
          'bg-lime text-ink': stage.state === 'closed',
          'bg-paper text-ink-soft': stage.state === 'upcoming',
        }"
      >
        <Check v-if="stage.state === 'closed'" class="size-5" aria-hidden="true" />
        <Lock v-else-if="stage.state === 'upcoming'" class="size-4" aria-hidden="true" />
        <template v-else>{{ index + 1 }}</template>
      </span>
      <div class="min-w-0 flex-1">
        <p class="font-semibold">{{ stage.title }}</p>
        <p class="text-ink-soft text-sm">{{ when(stage.opensAt, stage.closesAt) }}</p>
      </div>
      <span
        class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold"
        :class="stage.state === 'open' ? 'bg-accent/10 text-accent' : 'bg-paper text-ink-soft'"
      >
        {{ STATE_LABEL[stage.state] }}
      </span>
    </li>
  </ol>
</template>
