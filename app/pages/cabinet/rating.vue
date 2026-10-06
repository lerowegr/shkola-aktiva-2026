<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";

import { GAME_KINDS, GAMES, type GameKind } from "~~/lib/games/rules";

/**
 * Рейтинг: общий зачёт и топ каждой игры. Только псевдонимы — настоящее
 * имя под строкой видит лишь организатор.
 */
useHead({ title: "Рейтинг" });

interface RatingRow {
  rank: number;
  name: string;
  avatar: string | null;
  points: number;
  played: number;
  isMe: boolean;
  fullName: string | null;
  score?: number;
  moves?: number | null;
  durationMs?: number;
}

interface RatingData {
  rows: RatingRow[];
  players: number;
  me: { rank: number; points: number; players: number } | null;
}

const tab = ref<"overall" | GameKind>("overall");
const { data: overall } = await useFetch<RatingData>("/api/cabinet/rating");

const board = ref<{ rows: RatingRow[]; players: number } | null>(null);
const boardLoading = ref(false);
async function load(game: GameKind) {
  boardLoading.value = true;
  board.value = await $fetch<{ rows: RatingRow[]; players: number }>("/api/cabinet/games/board", {
    query: { game: GAMES[game].slug },
  });
  boardLoading.value = false;
}
watch(tab, (value) => {
  if (value !== "overall") void load(value);
});
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
      <NuxtLink to="/cabinet/games" class="text-ink-soft hover:text-ink inline-flex items-center gap-1 self-start text-sm">
        <ArrowLeft class="size-4" aria-hidden="true" /> Все игры
      </NuxtLink>
      <div class="flex flex-col gap-1">
        <h1 class="font-display text-3xl">Рейтинг</h1>
        <p class="text-ink-soft">Общий зачёт — сумма мест во всех играх. На отбор не влияет.</p>
      </div>

      <div class="flex gap-1 overflow-x-auto" role="tablist" aria-label="Зачёты">
        <button
          type="button"
          role="tab"
          :aria-selected="tab === 'overall'"
          class="shrink-0 rounded-xl px-4 text-sm leading-10 font-medium"
          :class="tab === 'overall' ? 'bg-paper border-line border' : 'text-ink-soft hover:text-ink'"
          @click="tab = 'overall'"
        >
          Общий
        </button>
        <button
          v-for="game in GAME_KINDS"
          :key="game"
          type="button"
          role="tab"
          :aria-selected="tab === game"
          class="shrink-0 rounded-xl px-4 text-sm leading-10 font-medium"
          :class="tab === game ? 'bg-paper border-line border' : 'text-ink-soft hover:text-ink'"
          @click="tab = game"
        >
          {{ GAMES[game].title }}
        </button>
      </div>

      <section v-if="tab === 'overall'" class="bg-card border-line rounded-3xl border p-3">
        <GameBoard v-if="overall" :rows="overall.rows" points />
        <p v-if="overall?.me" class="text-ink-soft px-3 py-2 text-sm">
          Вы: {{ overall.me.rank }} место из {{ overall.me.players }} · {{ overall.me.points }} очков
        </p>
      </section>
      <section v-else class="bg-card border-line rounded-3xl border p-3">
        <div v-if="boardLoading" class="bg-line/60 h-40 animate-pulse rounded-2xl" aria-hidden="true" />
        <template v-else-if="board">
          <GameBoard :rows="board.rows" :game="tab" />
        </template>
      </section>

      <p class="text-ink-soft text-center text-sm">
        Имя и фото — из <NuxtLink to="/cabinet/profile" class="underline">профиля</NuxtLink>.
      </p>
    </main>
  </div>
</template>
