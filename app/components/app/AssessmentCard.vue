<script setup lang="ts">
import { CalendarClock, MapPin, UsersRound } from "lucide-vue-next";

import type { CandidateAssessment } from "~~/lib/assessment/candidate";
import { placeLine } from "~~/lib/assessment/rules";

/**
 * Центр оценки в кабинете кандидата: что за этап и, когда группе сообщили,
 * — корпус, аудитория и время. Результатов здесь нет и не будет.
 */
const props = defineProps<{ co: CandidateAssessment }>();

const place = computed(() => props.co.place);
// Время ЦО прошло — дальше ждём решения, а не идём в аудиторию.
const over = computed(() => Boolean(place.value?.startsAt && new Date(place.value.startsAt).getTime() + 4 * 60 * 60 * 1000 < Date.now()));
const fallback = computed(() =>
  place.value
    ? "Очный групповой этап: задания в команде вместе с другими кандидатами."
    : "Очный групповой этап: задания в команде вместе с другими кандидатами. Корпус, аудиторию и время пришлём уведомлением.",
);
</script>

<template>
  <section class="bg-brand-orange-soft border-ink/10 flex flex-col gap-4 rounded-3xl border p-5" aria-labelledby="co-title">
    <div class="flex items-start gap-4">
      <span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/60">
        <UsersRound class="size-6" aria-hidden="true" />
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="co-title" class="font-display text-xl">{{ co.title }}</h2>
        <p class="text-ink/80 text-sm whitespace-pre-line">{{ co.description ?? fallback }}</p>
      </div>
    </div>

    <p v-if="over" class="bg-card/80 rounded-2xl p-4 text-sm">
      Центр оценки прошёл — спасибо! О следующем этапе сообщим здесь и в Telegram.
    </p>
    <dl v-else-if="place" class="bg-card/80 grid gap-3 rounded-2xl p-4 text-sm sm:grid-cols-2">
      <div class="flex items-start gap-2.5">
        <MapPin class="text-ink-soft mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <dt class="text-ink-soft">Где</dt>
          <dd class="font-semibold">{{ placeLine(place) }}</dd>
        </div>
      </div>
      <div v-if="place.startsAt" class="flex items-start gap-2.5">
        <CalendarClock class="text-ink-soft mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <dt class="text-ink-soft">Когда</dt>
          <dd class="font-semibold">{{ mskDay(place.startsAt) }}, {{ mskTime(place.startsAt) }} <span class="text-ink-soft font-normal">МСК</span></dd>
        </div>
      </div>
      <p v-if="place.note" class="text-ink/80 whitespace-pre-line sm:col-span-2">{{ place.note }}</p>
    </dl>
    <p v-else class="text-ink/70 text-sm">Где и когда — пришлём уведомлением, как только группы будут готовы.</p>
  </section>
</template>
