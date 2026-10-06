<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";

import { GAME_KINDS, GAMES, type GameKind } from "~~/lib/games/rules";

/**
 * Рейтинг: общий зачёт и топ каждой игры. Только псевдонимы — настоящее
 * имя под строкой видит лишь организатор. На широком экране выбор игры —
 * вертикальный список слева, таблица справа; переключение с анимацией.
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

interface BoardData {
  rows: RatingRow[];
  players: number;
  me?: { rank: number; players: number } | null;
}

interface RatingData {
  rows: RatingRow[];
  players: number;
  me: { rank: number; points: number; players: number } | null;
}

const tab = ref<"overall" | GameKind>("overall");
const { data: overall } = await useFetch<RatingData>("/api/cabinet/rating");

const board = ref<BoardData | null>(null);
const boardLoading = ref(false);
async function load(game: GameKind) {
  boardLoading.value = true;
  board.value = await $fetch<BoardData>("/api/cabinet/games/board", {
    query: { game: GAMES[game].slug },
  });
  boardLoading.value = false;
}
watch(tab, (value) => {
  if (value !== "overall") void load(value);
});

const TABS = [{ key: "overall", label: "Общий" }, ...GAME_KINDS.map((game) => ({ key: game, label: GAMES[game].title }))] as const;
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-6">
      <NuxtLink to="/cabinet/games" class="text-ink-soft hover:text-ink inline-flex items-center gap-1 self-start text-sm">
        <ArrowLeft class="size-4" aria-hidden="true" /> Все игры
      </NuxtLink>
      <div class="flex flex-col gap-1">
        <h1 class="font-display text-3xl">Рейтинг</h1>
        <p class="text-ink-soft">Общий зачёт — сумма мест во всех играх. На отбор не влияет.</p>
      </div>

      <div class="flex flex-col gap-4 sm:grid sm:grid-cols-[13rem_minmax(0,1fr)] sm:items-start sm:gap-6">
        <div
          class="flex gap-1 overflow-x-auto sm:sticky sm:top-4 sm:flex-col sm:overflow-visible"
          role="tablist"
          aria-label="Зачёты"
        >
          <button
            v-for="item in TABS"
            :key="item.key"
            type="button"
            role="tab"
            :aria-selected="tab === item.key"
            class="shrink-0 rounded-xl px-4 text-sm leading-10 font-medium sm:w-full sm:text-left"
            :class="tab === item.key ? 'bg-paper border-line border' : 'text-ink-soft hover:text-ink'"
            @click="tab = item.key"
          >
            {{ item.label }}
          </button>
        </div>

        <Transition name="board" mode="out-in">
          <section v-if="tab === 'overall'" :key="'overall'" class="bg-card border-line min-w-0 rounded-3xl border p-3">
            <GameBoard v-if="overall && overall.rows.length > 0" :rows="overall.rows" points />
            <p v-else-if="overall" class="text-ink-soft px-3 py-6 text-center text-sm">Пока никто не играл — станьте первым.</p>
            <p v-if="overall?.me" class="text-ink-soft px-3 py-2 text-sm">
              Вы: {{ overall.me.rank }} место из {{ overall.me.players }} · {{ overall.me.points }} очков
            </p>
          </section>
          <section v-else :key="tab" class="bg-card border-line min-w-0 rounded-3xl border p-3">
            <div v-if="boardLoading" class="bg-line/60 h-40 animate-pulse rounded-2xl" aria-hidden="true" />
            <template v-else-if="board">
              <GameBoard v-if="board.rows.length > 0" :rows="board.rows.slice(0, 20)" :game="tab" />
              <p v-else class="text-ink-soft px-3 py-6 text-center text-sm">В эту игру пока никто не играл — станьте первым.</p>
              <p v-if="board.me" class="text-ink-soft px-3 py-2 text-sm">Вы: {{ board.me.rank }} место из {{ board.me.players }}</p>
            </template>
          </section>
        </Transition>
      </div>

      <p class="text-ink-soft text-center text-sm">
        Имя и фото — из <NuxtLink to="/cabinet/profile" class="underline">профиля</NuxtLink>.
      </p>
    </main>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .board-enter-active,
  .board-leave-active {
    transition:
      opacity 0.18s ease,
      transform 0.18s ease;
  }
  .board-enter-from {
    opacity: 0;
    transform: translateY(8px);
  }
  .board-leave-to {
    opacity: 0;
    transform: translateY(-6px);
  }
}
</style>
