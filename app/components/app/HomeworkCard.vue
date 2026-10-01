<script setup lang="ts">
import { ArrowRight, PartyPopper } from "lucide-vue-next";

import type { HomeworkView } from "~~/lib/applications/homework";

/** Результат анкеты и путь к домашнему заданию — в кабинете кандидата. */
const props = defineProps<{ hw: HomeworkView }>();
const Link = resolveComponent("NuxtLink");

const current = computed(() => props.hw.submissions.find((item) => item.current) ?? null);
const day = (value: Date | string) => mskFormat(value, "d MMMM");
</script>

<template>
  <div v-if="hw.admission === 'REJECTED'" class="bg-card border-line rounded-3xl border p-5">
    <p class="font-semibold">Результаты анкеты</p>
    <p class="text-ink-soft text-sm">В этот раз дальше пройти не получилось. Спасибо, что подали анкету, — приходите на следующий набор!</p>
  </div>

  <component
    :is="Link"
    v-else-if="hw.admission === 'PASSED'"
    to="/cabinet/homework"
    class="bg-brand-green group flex items-center gap-4 rounded-3xl p-5 transition hover:brightness-105"
  >
    <span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/50">
      <PartyPopper class="size-6" aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block font-semibold">Вы прошли на домашнее задание!</span>
      <span class="block text-sm">
        <template v-if="current">Сдано {{ day(current.submittedAt) }} — можно пересдать до дедлайна.</template>
        <template v-else-if="hw.state === 'open'">Задание ждёт{{ hw.closesAt ? ` — сдать до ${day(hw.closesAt)}` : "" }}.</template>
        <template v-else-if="hw.state === 'upcoming'">Приём работ откроется{{ hw.opensAt ? ` ${day(hw.opensAt)}` : " скоро" }}.</template>
        <template v-else>Приём работ закрыт.</template>
      </span>
    </span>
    <ArrowRight class="size-5 shrink-0 transition group-hover:translate-x-0.5" aria-hidden="true" />
  </component>
</template>
