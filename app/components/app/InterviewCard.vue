<script setup lang="ts">
import { ArrowRight, CalendarCheck, Mic, Trophy } from "lucide-vue-next";

import type { CandidateInterview } from "~~/lib/interviews/booking";

/** Собеседование и итог отбора — в кабинете кандидата. */
defineProps<{ iv: CandidateInterview }>();
</script>

<template>
  <NuxtLink
    v-if="iv.final === 'PASSED'"
    to="/cabinet/interview"
    class="bg-brand-yellow flex items-center gap-4 rounded-3xl p-5"
  >
    <span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/50"><Trophy class="size-6" aria-hidden="true" /></span>
    <span class="flex-1">
      <span class="block font-semibold">Вы в Школе Актива! 🎉</span>
      <span class="block text-sm">Поздравляем — вы прошли отбор.</span>
    </span>
  </NuxtLink>
  <div v-else-if="iv.final === 'REJECTED'" class="bg-card border-line rounded-3xl border p-5">
    <p class="font-semibold">Итоги отбора</p>
    <p class="text-ink-soft text-sm">В этот раз места не хватило. Спасибо, что прошли весь отбор!</p>
  </div>
  <NuxtLink
    v-else-if="iv.admission === 'PASSED'"
    to="/cabinet/interview"
    class="group flex items-center gap-4 rounded-3xl p-5 transition"
    :class="iv.booking ? 'bg-ink text-paper' : 'bg-accent text-accent-ink hover:brightness-110'"
  >
    <span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15">
      <CalendarCheck v-if="iv.booking" class="size-6" aria-hidden="true" />
      <Mic v-else class="size-6" aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block font-semibold">{{ iv.booking ? "Вы записаны на собеседование" : "Вы прошли на собеседование!" }}</span>
      <span class="block text-sm opacity-80">
        <template v-if="iv.booking">
          <span class="first-letter:uppercase">{{ mskDay(iv.booking.startsAt) }}</span>, {{ mskTime(iv.booking.startsAt) }} · {{ iv.booking.location }}
        </template>
        <template v-else-if="iv.state === 'open'">Выберите удобное время — слоты разбирают быстро.</template>
        <template v-else>Запись откроется скоро.</template>
      </span>
    </span>
    <ArrowRight class="size-5 shrink-0 transition group-hover:translate-x-0.5" aria-hidden="true" />
  </NuxtLink>
</template>
