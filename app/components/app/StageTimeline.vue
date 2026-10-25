<script setup lang="ts">
import { Check, Clock, Lock } from "lucide-vue-next";

import type { StageState } from "~~/lib/stages";

/**
 * Этапы отбора лентой: что прошло, что идёт, что впереди и когда.
 * Домашнее задание — часть анкеты, отдельным этапом его не показываем.
 *
 * `personal` — где по этапу сам кандидат («Анкета отправлена», «Вы
 * записаны», «Ждём итогов»); без него лента показывает общий статус этапа.
 */
interface PersonalStage {
  label: string;
  /** done — пройдено, now — сейчас его ход, wait — ждём организаторов. */
  tone: "done" | "now" | "wait";
  to?: string;
}

const props = defineProps<{
  stages: {
    id: string;
    kind?: string;
    title: string;
    state: StageState;
    opensAt: string | Date | null;
    closesAt: string | Date | null;
  }[];
  personal?: Partial<Record<string, PersonalStage>>;
}>();

const STATE_LABEL: Record<StageState, string> = {
  upcoming: "Скоро",
  open: "Идёт сейчас",
  closed: "Завершён",
};

const rows = computed(() =>
  props.stages
    .filter((stage) => stage.kind !== "HOMEWORK")
    .map((stage) => {
      const mine = stage.kind ? props.personal?.[stage.kind] : undefined;
      const tone = mine?.tone ?? (stage.state === "open" ? "now" : stage.state === "closed" ? "done" : "locked");
      return { ...stage, label: mine?.label ?? STATE_LABEL[stage.state], tone, to: mine?.to };
    }),
);

function when(opensAt: string | Date | null, closesAt: string | Date | null): string {
  const day = (value: string | Date) => mskFormat(value, "d MMMM");
  if (opensAt && closesAt) return `${day(opensAt)} — ${day(closesAt)}`;
  if (opensAt) return `с ${day(opensAt)}`;
  return "Даты объявим";
}
const Link = resolveComponent("NuxtLink");
</script>

<template>
  <ol class="flex flex-col gap-3">
    <li v-for="(stage, index) in rows" :key="stage.id">
      <component
        :is="stage.to ? Link : 'div'"
        :to="stage.to"
        class="bg-card flex items-center gap-4 rounded-2xl border p-4 transition"
        :class="[stage.tone === 'now' ? 'border-accent ring-accent/15 ring-4' : 'border-line', stage.to && 'hover:border-ink-soft']"
      >
        <span
          class="font-display grid size-10 shrink-0 place-items-center rounded-xl text-sm"
          :class="{
            'bg-accent text-accent-ink': stage.tone === 'now',
            'bg-lime text-ink': stage.tone === 'done',
            'bg-brand-yellow-soft text-ink': stage.tone === 'wait',
            'bg-paper text-ink-soft': stage.tone === 'locked',
          }"
        >
          <Check v-if="stage.tone === 'done'" class="size-5" aria-hidden="true" />
          <Clock v-else-if="stage.tone === 'wait'" class="size-5" aria-hidden="true" />
          <Lock v-else-if="stage.tone === 'locked'" class="size-4" aria-hidden="true" />
          <template v-else>{{ index + 1 }}</template>
        </span>
        <div class="flex min-w-0 flex-1 flex-col items-start gap-0.5 sm:flex-row sm:items-center sm:gap-4">
          <div class="min-w-0 flex-1">
            <p class="font-semibold">{{ stage.title }}</p>
            <p class="text-ink-soft text-sm">{{ when(stage.opensAt, stage.closesAt) }}</p>
          </div>
          <!-- На телефоне статус — под названием, чтобы не сжимать даты. -->
          <span
            class="mt-1 rounded-full px-3 py-1 text-xs font-semibold sm:mt-0 sm:max-w-[45%] sm:shrink-0 sm:text-right"
            :class="{
              'bg-accent/10 text-accent': stage.tone === 'now',
              'bg-brand-green-soft text-ok': stage.tone === 'done',
              'bg-brand-yellow-soft text-ink': stage.tone === 'wait',
              'bg-paper text-ink-soft': stage.tone === 'locked',
            }"
          >
            {{ stage.label }}
          </span>
        </div>
      </component>
    </li>
  </ol>
</template>
