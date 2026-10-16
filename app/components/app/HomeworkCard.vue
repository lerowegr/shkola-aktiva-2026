<script setup lang="ts">
import { PartyPopper } from "lucide-vue-next";

import type { HomeworkView } from "~~/lib/applications/homework";

/** Результат анкеты (вместе с домашним заданием) — в кабинете кандидата. */
defineProps<{ hw: HomeworkView }>();
</script>

<template>
  <div v-if="hw.admission === 'REJECTED'" class="bg-card border-line rounded-3xl border p-5">
    <p class="font-semibold">Результаты анкеты</p>
    <p class="text-ink-soft text-sm">В этот раз дальше пройти не получилось. Спасибо, что подали анкету, — приходите на следующий набор!</p>
  </div>

  <div v-else-if="hw.admission === 'PASSED'" class="bg-brand-green flex items-center gap-4 rounded-3xl p-5">
    <span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/50">
      <PartyPopper class="size-6" aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block font-semibold">Анкета и домашнее задание приняты!</span>
      <span class="block text-sm">Дальше — следующий этап отбора. Подробности придут сюда и в Telegram.</span>
    </span>
  </div>
</template>
