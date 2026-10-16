<script setup lang="ts">
import type { LandingCta } from "~/landing/cta";

/**
 * Шапка главной: знак, якоря на разделы и та же кнопка, что на первом
 * экране. Пока страница наверху — прозрачная, дальше — на бумаге.
 * Прокрутку не слушаем: смотрим, виден ли верх страницы.
 */
defineProps<{ cta: LandingCta; links: { href: string; label: string }[] }>();

const scrolled = ref(false);
let observer: IntersectionObserver | null = null;
const sentinel = ref<HTMLElement | null>(null);

onMounted(() => {
  observer = new IntersectionObserver(([entry]) => (scrolled.value = !entry?.isIntersecting));
  observer.observe(sentinel.value!);
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div ref="sentinel" class="absolute inset-x-0 top-0 h-4" aria-hidden="true" />
  <header
    class="fixed inset-x-0 top-0 z-30 transition-[background-color,border-color,backdrop-filter] duration-300"
    :class="scrolled ? 'bg-paper/85 border-line border-b backdrop-blur-md' : 'border-b border-transparent'"
  >
    <!-- Три колонки: разделы стоят ровно по центру, сколько бы их ни было. -->
    <div class="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4">
      <NuxtLink to="/" class="flex items-center gap-2 justify-self-start" aria-label="Школа Актива, на главную">
        <img src="/brand/logo-sticker-short.webp" alt="" width="40" height="40" class="size-10 rounded-full">
      </NuxtLink>
      <nav class="col-start-2 hidden items-center justify-center gap-1 lg:flex" aria-label="Разделы">
        <a
          v-for="link in links"
          :key="link.href"
          :href="link.href"
          class="text-ink-soft hover:text-ink rounded-full px-3 py-2 text-sm font-medium"
        >
          {{ link.label }}
        </a>
      </nav>
      <NuxtLink :to="cta.to" class="landing-button landing-button--primary col-start-3 min-h-10 justify-self-end px-4 text-sm">{{ cta.label }}</NuxtLink>
    </div>
  </header>
</template>
