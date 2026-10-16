<script setup lang="ts">
import { ArrowRight, CalendarCheck, Mic, Trophy } from "lucide-vue-next";

import type { CandidateInterview } from "~~/lib/interviews/booking";

/** Собеседование и итог отбора — в кабинете кандидата. */
const props = defineProps<{ iv: CandidateInterview }>();
// Время собеседования прошло, итогов ещё нет — не «записаны», а «ждём итогов».
const past = computed(() => Boolean(props.iv.booking && new Date(props.iv.booking.endsAt).getTime() < Date.now()));
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
  <NuxtLink v-else-if="iv.final === 'REJECTED'" to="/cabinet/interview" class="bg-card border-line flex items-start gap-4 rounded-3xl border p-5">
    <span class="bg-paper grid size-12 shrink-0 place-items-center rounded-2xl text-2xl" aria-hidden="true">😔</span>
    <span class="flex-1">
      <span class="block font-semibold">Итоги отбора</span>
      <span class="text-ink-soft block text-sm">Спасибо, что прошли весь отбор — анкету, центр оценки и собеседование 💛 В этот раз места в Школе Актива не хватило, и нам правда жаль 😔 Это не про то, что вы чего-то не умеете: мест мало, а сильных ребят много. Будем очень рады видеть вас в следующем наборе!</span>
    </span>
  </NuxtLink>
  <NuxtLink
    v-else-if="iv.allowed"
    to="/cabinet/interview"
    class="group flex items-center gap-4 rounded-3xl p-5 transition"
    :class="iv.booking ? 'bg-ink text-paper' : 'bg-accent text-accent-ink hover:brightness-110'"
  >
    <span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/15">
      <CalendarCheck v-if="iv.booking" class="size-6" aria-hidden="true" />
      <Mic v-else class="size-6" aria-hidden="true" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block font-semibold">
        {{ past ? "Вы уже были на собеседовании" : iv.booking ? "Вы записаны на собеседование" : "Собеседование: выберите время" }}
      </span>
      <span class="block text-sm opacity-80">
        <template v-if="past">Спасибо! Ждите итогов — они придут сюда и в Telegram.</template>
        <template v-else-if="iv.booking">
          <span class="first-letter:uppercase">{{ mskDay(iv.booking.startsAt) }}</span>, {{ mskTime(iv.booking.startsAt) }} · {{ iv.booking.location }}
        </template>
        <template v-else-if="iv.state === 'open'">Выберите удобное время — слоты разбирают быстро.</template>
        <template v-else>Запись откроется скоро.</template>
      </span>
    </span>
    <ArrowRight class="size-5 shrink-0 transition group-hover:translate-x-0.5" aria-hidden="true" />
  </NuxtLink>
</template>
