<script setup lang="ts">
import { ArrowLeft, Flame } from "lucide-vue-next";

import type { DailyStatus } from "~~/lib/games/daily";
import { GAMES } from "~~/lib/games/rules";

/** Задание дня: вид и сид — с сервера, расклад одинаковый у всех. */
useHead({ title: "Задание дня" });

const { data, refresh } = await useFetch<DailyStatus>("/api/cabinet/daily");

const KIND_TITLE: Record<DailyStatus["kind"], string> = {
  MEMORY: GAMES.MEMORY.title,
  PIXEL: GAMES.PIXEL.title,
  QUIZ: "Викторина",
};
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6">
      <NuxtLink to="/cabinet" class="text-ink-soft hover:text-ink inline-flex items-center gap-1 self-start text-sm">
        <ArrowLeft class="size-4" aria-hidden="true" /> Кабинет
      </NuxtLink>
      <div class="flex flex-col gap-1">
        <h1 class="font-display text-3xl">Задание дня</h1>
        <p class="text-ink-soft">
          Сегодня — «{{ data ? KIND_TITLE[data.kind] : "…" }}». Одна попытка в серию, расклад у всех одинаковый.
        </p>
        <p v-if="data && (data.streak > 0 || data.best > 0)" class="flex items-center gap-1 text-sm">
          <Flame class="size-4" aria-hidden="true" /> Серия: <strong>{{ data.streak }}</strong>
          <span class="text-ink-soft">· лучшая {{ data.best }}</span>
        </p>
      </div>

      <p v-if="data?.solved" class="bg-card border-line rounded-3xl border p-6 text-center">
        Сегодняшнее задание уже решено. Возвращайтесь завтра — серия ждёт.
      </p>
      <GameDailyGame v-else-if="data" :kind="data.kind" :seed="data.seed" @solved="refresh()" />
    </main>
  </div>
</template>
