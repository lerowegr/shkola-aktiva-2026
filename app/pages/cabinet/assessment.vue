<script setup lang="ts">
import { CalendarClock, CalendarCheck, MapPin, UsersRound } from "lucide-vue-next";

import type { CandidateAssessment } from "~~/lib/assessment/candidate";
import { placeLine } from "~~/lib/assessment/rules";

/**
 * Центр оценки: выбор даты для своего факультета, перенос и отмена — или,
 * если группу собрали организаторы, просто где и когда.
 */
useHead({ title: "Центр оценки" });

const { data, refresh } = await useFetch<{ assessment: CandidateAssessment | null }>("/api/cabinet/assessment");
const co = computed(() => data.value?.assessment ?? null);
const HOUR = 60 * 60 * 1000;
const over = computed(() => Boolean(co.value?.place?.startsAt && new Date(co.value.place.startsAt).getTime() + 4 * HOUR < Date.now()));

const bookAction = useAction("/api/cabinet/assessment/book");
const cancelAction = useAction("/api/cabinet/assessment/cancel");
const choosing = ref(false);
const confirmCancel = ref(false);

// Без места — сразу выбор; со своей записью — по кнопке «Перенести».
const showOptions = computed(() => Boolean(co.value && !over.value && (!co.value.place || choosing.value) && co.value.state !== "closed"));

async function book(groupId: string) {
  const result = await bookAction.submit({ groupId });
  await refresh();
  if (result.ok) choosing.value = false;
}

async function cancel() {
  const result = await cancelAction.submit({});
  confirmCancel.value = false;
  if (result.ok) await refresh();
}
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div class="flex flex-col gap-1">
        <NuxtLink to="/cabinet" class="text-ink-soft hover:text-ink text-sm">← Кабинет</NuxtLink>
        <h1 class="font-display text-3xl">{{ co?.title ?? "Центр оценки" }}</h1>
      </div>

      <p v-if="!co" class="bg-card border-line rounded-3xl border p-5 text-sm">
        Центр оценки откроется после отправки анкеты с домашним заданием.
      </p>

      <template v-else>
        <p class="text-ink-soft whitespace-pre-line">
          {{ co.description ?? "Очный групповой этап: задания в команде вместе с другими кандидатами." }}
        </p>

        <div v-if="over" class="bg-brand-green-soft rounded-3xl p-5">
          <p class="font-semibold">Вы уже были на центре оценки ✨</p>
          <p class="text-ink-soft text-sm">Спасибо! Дальше — собеседование, а итоги отбора объявим в конце.</p>
        </div>

        <!-- Своё место -->
        <section v-else-if="co.place" class="bg-ink text-paper flex flex-col gap-3 rounded-3xl p-5">
          <p class="flex items-center gap-2 font-semibold">
            <CalendarCheck class="size-5" aria-hidden="true" />
            <span v-if="co.place.startsAt" class="first-letter:uppercase">
              {{ mskDay(co.place.startsAt) }}, {{ mskTime(co.place.startsAt) }} МСК
            </span>
          </p>
          <p class="text-paper/80 flex items-center gap-2 text-sm"><MapPin class="size-4" aria-hidden="true" /> {{ placeLine(co.place) }}</p>
          <p v-if="co.place.note" class="text-paper/80 text-sm whitespace-pre-line">{{ co.place.note }}</p>

          <div v-if="co.canChange" class="flex flex-wrap gap-2">
            <button type="button" class="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20" @click="choosing = !choosing">
              {{ choosing ? "Оставить как есть" : "Перенести" }}
            </button>
            <button v-if="!confirmCancel" type="button" class="text-paper/70 hover:text-paper rounded-xl px-4 py-2 text-sm" @click="confirmCancel = true">
              Отменить запись
            </button>
            <template v-else>
              <span class="self-center text-sm">Точно отменить?</span>
              <button type="button" class="bg-brand-red rounded-xl px-4 py-2 text-sm font-semibold" @click="cancel">Да, отменить</button>
              <button type="button" class="text-paper/70 rounded-xl px-4 py-2 text-sm" @click="confirmCancel = false">Нет</button>
            </template>
          </div>
          <p v-else-if="co.selfBooked" class="text-paper/60 text-xs">До центра оценки меньше 12 часов — перенести можно только через организаторов.</p>
          <p v-else class="text-paper/60 text-xs">Группу собрали организаторы. Если дата не подходит — напишите им в «Сообщениях».</p>
        </section>

        <UiNotice v-if="cancelAction.result.value" :ok="cancelAction.result.value.ok" :message="cancelAction.result.value.message" />
        <UiNotice v-if="bookAction.result.value" :ok="bookAction.result.value.ok" :message="bookAction.result.value.message" />

        <!-- Выбор даты -->
        <section v-if="showOptions" class="flex flex-col gap-3">
          <h2 class="font-display text-lg">{{ co.place ? "Выберите другую дату" : "Выберите дату" }}</h2>
          <p v-if="co.options.length === 0" class="bg-card border-line text-ink-soft rounded-3xl border p-5 text-sm">
            Свободных дат для вашего факультета сейчас нет. Организаторы добавят новые — пришлём уведомление.
          </p>
          <button
            v-for="option in co.options"
            :key="option.id"
            type="button"
            class="bg-card border-line hover:border-accent flex items-center gap-4 rounded-3xl border p-4 text-left transition disabled:opacity-50"
            :disabled="bookAction.pending.value"
            @click="book(option.id)"
          >
            <span class="bg-brand-orange-soft grid size-12 shrink-0 place-items-center rounded-2xl">
              <CalendarClock class="size-6" aria-hidden="true" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block font-semibold first-letter:uppercase">{{ mskDay(option.startsAt) }}, {{ mskTime(option.startsAt) }} МСК</span>
              <span class="text-ink-soft block truncate text-sm">{{ placeLine(option) || "Место уточним" }}</span>
            </span>
            <span class="text-ink-soft flex shrink-0 items-center gap-1 text-xs">
              <UsersRound class="size-3.5" aria-hidden="true" /> мест: {{ option.free }}
            </span>
          </button>
        </section>

        <p v-else-if="!co.place && co.state === 'closed'" class="bg-brand-red-soft rounded-3xl p-5 text-sm">
          Запись на центр оценки закрыта. Если вы не успели — напишите организаторам.
        </p>
      </template>
    </main>
  </div>
</template>
