<script setup lang="ts">
/**
 * Лента-наклейка под первым экраном: шаги отбора и маскоты. Единственная
 * бегущая строка на странице. При «уменьшить движение» стоит на месте.
 */
const WORDS = [
  { text: "анкета", mascot: "green" },
  { text: "домашнее задание", mascot: "orange" },
  { text: "собеседование", mascot: "purple" },
  { text: "школа актива 2026", mascot: "yellow-a" },
];
</script>

<template>
  <div class="relative z-10 -my-6 overflow-hidden py-6" aria-hidden="true">
    <div class="bg-ink text-paper -mx-4 -rotate-2 py-3">
      <div class="marquee flex w-max">
        <div v-for="copy in 2" :key="copy" class="flex shrink-0 items-center">
          <template v-for="word in WORDS" :key="word.text">
            <span class="font-display px-6 text-2xl whitespace-nowrap uppercase sm:text-3xl">{{ word.text }}</span>
            <img :src="`/brand/mascots/${word.mascot}.webp`" alt="" class="h-10 w-auto sm:h-12" loading="lazy">
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .marquee {
    animation: run 32s linear infinite;
  }
}

@keyframes run {
  to {
    transform: translateX(-50%);
  }
}
</style>
