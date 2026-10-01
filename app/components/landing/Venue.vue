<script setup lang="ts">
import type { SiteContent } from "~~/lib/site/content";

/**
 * «Где и когда»: тёмная карточка с местом и датами. Рядом — фото места, если
 * их загрузили, иначе стеклянная плитка бренда с объектами.
 */
defineProps<{ venue: SiteContent["venue"] }>();
</script>

<template>
  <section id="mesto" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:py-32">
    <div class="bg-ink text-paper grid overflow-hidden rounded-3xl md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div class="flex flex-col gap-8 p-8 sm:p-12">
        <h2 class="font-display text-4xl sm:text-5xl">{{ venue.title }}</h2>
        <dl class="flex flex-col gap-6">
          <div v-if="venue.place" class="flex flex-col gap-1">
            <dt class="text-paper/60 text-sm">Место</dt>
            <dd class="text-2xl font-semibold sm:text-4xl">{{ venue.place }}</dd>
          </div>
          <div v-if="venue.dates" class="flex flex-col gap-1">
            <dt class="text-paper/60 text-sm">Даты</dt>
            <dd class="text-2xl font-semibold sm:text-4xl">{{ venue.dates }}</dd>
          </div>
        </dl>
        <p v-if="venue.text" class="text-paper/80 max-w-[48ch] text-lg">{{ venue.text }}</p>
      </div>
      <div v-if="venue.photos.length" class="relative min-h-72 sm:min-h-96">
        <div class="absolute inset-0">
          <LandingPhotoSlider
            :photos="venue.photos"
            :label="`Фото: ${venue.place || venue.title}`"
            sizes="(min-width: 768px) 45vw, 100vw"
            dark
          />
        </div>
      </div>
      <div v-else class="relative min-h-64 overflow-hidden" aria-hidden="true">
        <img src="/brand/textures/tiles.webp" alt="" class="absolute inset-0 size-full object-cover" loading="lazy">
        <img src="/brand/objects/heart-pixel.webp" alt="" class="float absolute top-[14%] left-[16%] w-28 sm:w-36" loading="lazy">
        <img src="/brand/objects/asterisk-glass.webp" alt="" class="float absolute right-[12%] bottom-[16%] w-24 sm:w-32 [animation-delay:-2s]" loading="lazy">
        <img src="/brand/objects/moon-glass.webp" alt="" class="float absolute right-[30%] top-[40%] w-16 sm:w-20 [animation-delay:-4s]" loading="lazy">
      </div>
    </div>
  </section>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .float {
    animation: float 6s ease-in-out infinite;
  }
}

@keyframes float {
  50% {
    transform: translateY(-14px) rotate(6deg);
  }
}
</style>
