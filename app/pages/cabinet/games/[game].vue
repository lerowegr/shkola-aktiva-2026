<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";

import { gameBySlug, GAMES } from "~~/lib/games/rules";

/** Одна игра: поле, а после партии — итог с рекордом и местом. */
const route = useRoute();
const game = gameBySlug(String(route.params.game));
if (!game) throw createError({ statusCode: 404, statusMessage: "Такой игры нет." });

useHead({ title: GAMES[game].title });

// Топ игры — под итогом партии.
const { data: board } = useFetch<{ rows: { rank: number; name: string; avatar: string | null; isMe: boolean; fullName: string | null; score: number; moves: number | null; durationMs: number }[]; players: number }>(
  "/api/cabinet/games/board",
  { query: { game: GAMES[game].slug } },
);

// Новая партия — новый компонент: состояние игры начинается с нуля.
const round = ref(0);
const result = ref<{ score: number; moves?: number | null; durationMs: number } | null>(null);

// Секунду даём посмотреть на собранное поле, потом итог.
let reveal: ReturnType<typeof setTimeout> | null = null;
function finished(value: { score: number; moves?: number | null; durationMs: number }) {
  reveal = setTimeout(() => (result.value = value), 1100);
}
onBeforeUnmount(() => {
  if (reveal) clearTimeout(reveal);
});

function again() {
  result.value = null;
  round.value++;
}
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6">
      <NuxtLink to="/cabinet/games" class="text-ink-soft hover:text-ink inline-flex items-center gap-1 self-start text-sm">
        <ArrowLeft class="size-4" aria-hidden="true" /> Все игры
      </NuxtLink>
      <div class="flex flex-col gap-1">
        <h1 class="font-display text-3xl">{{ GAMES[game!].title }}</h1>
        <p class="text-ink-soft">{{ GAMES[game!].about }}</p>
      </div>

      <GameResult v-if="result" :key="`result-${round}`" :game="game!" :result="result" @again="again" />
      <section v-if="result && board && board.rows.length > 0" class="bg-card border-line rounded-3xl border p-3">
        <h2 class="font-display px-3 pt-1 pb-2 text-lg">Лучшие в «{{ GAMES[game!].title }}»</h2>
        <GameBoard :rows="board.rows.slice(0, 10)" :game="game!" />
        <NuxtLink to="/cabinet/rating" class="text-ink-soft hover:text-ink block px-3 py-2 text-sm">Весь рейтинг →</NuxtLink>
      </section>
      <!-- Партия случайна: на сервере и в браузере перемешалось бы по-разному. -->
      <ClientOnly v-else>
        <GameMemory v-if="game === 'MEMORY'" :key="round" @finished="finished" />
        <GameSlide v-else-if="game === 'SLIDE'" :key="round" @finished="finished" />
        <GameCatch v-else-if="game === 'CATCH'" :key="round" @finished="finished" />
        <GameTetris v-else-if="game === 'TETRIS'" :key="round" @finished="finished" />
        <GamePixel v-else-if="game === 'PIXEL'" :key="round" @finished="finished" />
        <GameSnake v-else-if="game === 'SNAKE'" :key="round" @finished="finished" />
        <GameQuiz v-else-if="game === 'QUIZ'" :key="round" @finished="finished" />
        <GameMerge v-else :key="round" @finished="finished" />
        <template #fallback>
          <div class="bg-line/60 mx-auto aspect-square w-full max-w-sm animate-pulse rounded-3xl" aria-hidden="true" />
        </template>
      </ClientOnly>
    </main>
  </div>
</template>
