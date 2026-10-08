<script setup lang="ts">
import { ArrowLeft, ChevronRight } from "lucide-vue-next";

import type { Standing } from "~~/lib/games/results";
import { describeResult, GAMES } from "~~/lib/games/rules";

/** Мини-игры: тест про ША сверху, дальше игры со своим лучшим результатом и местом. */
useHead({ title: "Мини-игры" });

const [{ data }, { data: test }] = await Promise.all([
  useFetch<{ games: Standing[]; staff: boolean }>("/api/cabinet/games"),
  useFetch<{ done: { score: number; total: number } | null }>("/api/cabinet/test"),
]);

const LOOK = {
  MEMORY: { tone: "bg-brand-green-soft", image: "/brand/mascots/green.webp" },
  SLIDE: { tone: "bg-brand-yellow-soft", image: "/brand/logo-sticker.webp" },
  CATCH: { tone: "bg-brand-purple-soft", image: "/brand/objects/heart-pixel.webp" },
  TETRIS: { tone: "bg-brand-blue-soft", image: "/brand/objects/star-pixel.webp" },
  PIXEL: { tone: "bg-brand-orange-soft", image: "/brand/mascots/orange.webp" },
  SNAKE: { tone: "bg-[#c9f3fa]", image: "/brand/objects/star-pixel.webp" },
  QUIZ: { tone: "bg-brand-red-soft", image: "/brand/logo-sticker-short.webp" },
  MERGE: { tone: "bg-line", image: "/brand/mascots/purple.webp" },
} as const;
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <NuxtLink to="/cabinet" class="text-ink-soft hover:text-ink inline-flex items-center gap-1 self-start text-sm">
        <ArrowLeft class="size-4" aria-hidden="true" /> Кабинет
      </NuxtLink>
      <div class="flex flex-col gap-2">
        <h1 class="font-display text-3xl">Мини-игры</h1>
        <p class="text-ink-soft">
          Пока идёт отбор — короткие игры с героями Школы. На отбор они не влияют: мастера ваши результаты не видят.
          <NuxtLink to="/cabinet/rating" class="underline">Общий рейтинг</NuxtLink>.
        </p>
      </div>

      <NuxtLink
        :to="`/cabinet/games/${GAMES.QUIZ.slug}`"
        class="bg-brand-red-soft border-ink/10 group flex items-center gap-4 rounded-3xl border p-4 transition hover:-translate-y-0.5"
      >
        <img :src="LOOK.QUIZ.image" alt="" class="w-20 shrink-0 transition group-hover:-rotate-6">
        <span class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="font-display text-xl">{{ GAMES.QUIZ.title }}</span>
          <span class="text-ink/75 text-sm">{{ GAMES.QUIZ.about }}</span>
          <span v-if="test?.done" class="text-sm">Пройден: <strong>{{ test.done.score }} из {{ test.done.total }}</strong></span>
        </span>
        <ChevronRight class="size-5 shrink-0" aria-hidden="true" />
      </NuxtLink>

      <ul class="flex flex-col gap-3">
        <li v-for="item in data?.games ?? []" :key="item.game">
          <NuxtLink
            :to="`/cabinet/games/${GAMES[item.game].slug}`"
            class="bg-card border-line hover:border-ink-soft group flex items-center gap-4 rounded-3xl border p-3 pr-4 transition"
          >
            <span class="grid size-20 shrink-0 place-items-center overflow-hidden rounded-2xl" :class="LOOK[item.game].tone">
              <img :src="LOOK[item.game].image" alt="" class="w-16 transition group-hover:scale-110 group-hover:-rotate-6">
            </span>
            <span class="flex min-w-0 flex-1 flex-col gap-1">
              <span class="font-display text-xl">{{ GAMES[item.game].title }}</span>
              <span class="text-ink-soft text-sm">{{ GAMES[item.game].about }}</span>
              <span v-if="item.best" class="text-sm">
                Лучший: <strong>{{ describeResult(item.game, item.best) }}</strong>
                <template v-if="item.rank"> · {{ item.rank }} место из {{ item.players }}</template>
              </span>
            </span>
            <ChevronRight class="text-ink-soft size-5 shrink-0" aria-hidden="true" />
          </NuxtLink>
        </li>
      </ul>
    </main>
  </div>
</template>
