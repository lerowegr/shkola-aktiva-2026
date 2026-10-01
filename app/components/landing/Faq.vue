<script setup lang="ts">
import { Plus } from "lucide-vue-next";

import type { SiteContent } from "~~/lib/site/content";

/** «Частые вопросы»: открыт один ответ за раз, слева заголовок держится на месте. */
defineProps<{ faq: SiteContent["faq"] }>();
</script>

<template>
  <section id="voprosy" class="mx-auto grid max-w-6xl scroll-mt-20 gap-10 px-4 py-24 sm:py-32 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]">
    <div class="flex flex-col gap-4 self-start lg:sticky lg:top-24">
      <h2 class="font-display text-4xl sm:text-5xl">{{ faq.title }}</h2>
      <p class="text-ink-soft text-lg">Не нашёл ответ? Напиши организаторам в разделе «Сообщения» в кабинете.</p>
      <img src="/brand/mascots/blue-b.webp" alt="" class="mt-4 hidden w-40 lg:block" loading="lazy">
    </div>
    <div class="border-ink/10 divide-ink/10 divide-y border-y">
      <details v-for="(item, index) in faq.items" :key="index" name="faq" class="group py-5" :open="index === 0">
        <summary class="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold sm:text-xl">
          {{ item.question }}
          <Plus class="size-6 shrink-0 transition-transform group-open:rotate-45" aria-hidden="true" />
        </summary>
        <p class="text-ink-soft mt-3 max-w-[62ch] text-lg">{{ item.answer }}</p>
      </details>
    </div>
  </section>
</template>

<style scoped>
summary::-webkit-details-marker {
  display: none;
}
</style>
