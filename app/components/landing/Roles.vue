<script setup lang="ts">
import { ArrowLeft, ArrowRight } from "lucide-vue-next";

import type { SiteContent } from "~~/lib/site/content";

/**
 * «Кем можно быть»: лента карточек с маскотами, листается пальцем,
 * колесом и стрелками. Маскот качается, когда на карточку наводят.
 */
defineProps<{ roles: SiteContent["roles"] }>();

const LOOK = [
  { tone: "bg-brand-yellow-soft", mascot: "yellow-b" },
  { tone: "bg-brand-blue-soft", mascot: "blue-a" },
  { tone: "bg-brand-orange-soft", mascot: "orange-angry" },
  { tone: "bg-brand-purple-soft", mascot: "purple-sleepy" },
  { tone: "bg-brand-green-soft", mascot: "green-angry" },
  { tone: "bg-brand-red-soft", mascot: "orange" },
  { tone: "bg-brand-blue-soft", mascot: "cyan" },
  { tone: "bg-brand-yellow-soft", mascot: "black-a" },
];

const track = ref<HTMLElement | null>(null);
function scroll(direction: -1 | 1) {
  const card = track.value?.querySelector("article");
  track.value?.scrollBy({ left: direction * ((card?.clientWidth ?? 300) + 16), behavior: "smooth" });
}
</script>

<template>
  <section id="roli" class="scroll-mt-20 py-24 sm:py-32">
    <div class="mx-auto flex max-w-6xl items-end justify-between gap-4 px-4">
      <h2 class="font-display text-4xl sm:text-5xl">{{ roles.title }}</h2>
      <div v-if="roles.items.length > 2" class="hidden gap-2 sm:flex">
        <button type="button" class="landing-button landing-button--ghost size-12 px-0" aria-label="Назад" @click="scroll(-1)">
          <ArrowLeft class="size-5" aria-hidden="true" />
        </button>
        <button type="button" class="landing-button landing-button--ghost size-12 px-0" aria-label="Дальше" @click="scroll(1)">
          <ArrowRight class="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div
      ref="track"
      class="track mt-10 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pb-4 sm:scroll-px-[max(1rem,calc((100%_-_72rem)/2_+_1rem))] sm:px-[max(1rem,calc((100%_-_72rem)/2_+_1rem))]"
    >
      <article
        v-for="(item, index) in roles.items"
        :key="index"
        class="group border-ink/10 bg-card w-[78%] max-w-80 shrink-0 snap-start overflow-hidden rounded-3xl border sm:w-80"
      >
        <div class="grid h-48 place-items-center" :class="LOOK[index % LOOK.length]!.tone">
          <img
            :src="`/brand/mascots/${LOOK[index % LOOK.length]!.mascot}.webp`"
            alt=""
            class="mascot h-32 w-auto"
            loading="lazy"
          >
        </div>
        <div class="flex flex-col gap-2 p-6">
          <h3 class="font-display text-2xl">{{ item.title }}</h3>
          <p v-if="item.text" class="text-ink-soft">{{ item.text }}</p>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.track {
  scrollbar-width: none;
}
.track::-webkit-scrollbar {
  display: none;
}

@media (prefers-reduced-motion: no-preference) {
  .group:hover .mascot {
    animation: wobble 0.7s ease-in-out;
  }
}

@keyframes wobble {
  25% {
    transform: rotate(-8deg) scale(1.05);
  }
  60% {
    transform: rotate(6deg);
  }
}
</style>
