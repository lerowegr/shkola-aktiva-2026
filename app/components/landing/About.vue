<script setup lang="ts">
import { motion } from "~/landing/motion";
import type { SiteContent } from "~~/lib/site/content";

/**
 * «О Школе»: текст проявляется по словам в темпе чтения, тезисы —
 * наклейки с маскотами. Без JS и при «уменьшить движение» текст сразу
 * виден целиком.
 */
const props = defineProps<{ about: SiteContent["about"] }>();

const paragraphs = computed(() =>
  props.about.text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim().split(/\s+/).filter(Boolean))
    .filter((words) => words.length),
);

const STICKERS = [
  { tone: "bg-brand-green-soft", turn: "-rotate-3", mascot: "green" },
  { tone: "bg-brand-yellow-soft", turn: "rotate-2", mascot: "yellow-b" },
  { tone: "bg-brand-purple-soft", turn: "-rotate-1", mascot: "purple" },
  { tone: "bg-brand-blue-soft", turn: "rotate-3", mascot: "blue-b" },
];

const section = ref<HTMLElement | null>(null);
let cleanup = () => {};
onMounted(async () => {
  cleanup = await motion(section.value!, ({ gsap }) => {
    const words = gsap.utils.toArray<HTMLElement>(".word");
    if (words.length) {
      gsap.fromTo(
        words,
        { opacity: 0.16 },
        {
          opacity: 1,
          stagger: 0.05,
          ease: "none",
          scrollTrigger: { trigger: ".words", start: "top 78%", end: "bottom 45%", scrub: true },
        },
      );
    }
    gsap.from(".sticker", {
      y: 50,
      opacity: 0,
      rotate: (index: number) => (index % 2 ? 12 : -12),
      stagger: 0.12,
      duration: 0.8,
      ease: "back.out(1.6)",
      scrollTrigger: { trigger: ".stickers", start: "top 80%" },
    });
  });
});
onBeforeUnmount(() => cleanup());
</script>

<template>
  <section id="o-shkole" ref="section" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:py-32">
    <div class="grid gap-14 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:items-start">
      <div class="flex flex-col gap-8">
        <h2 class="font-display text-4xl sm:text-5xl">{{ about.title }}</h2>
        <div v-if="paragraphs.length" class="words flex flex-col gap-6 text-2xl leading-snug font-medium sm:text-[2rem]">
          <p v-for="(words, index) in paragraphs" :key="index">
            <template v-for="(word, at) in words" :key="at"><span class="word">{{ word }}</span>{{ " " }}</template>
          </p>
        </div>
      </div>

      <ul v-if="about.points.length" class="stickers flex flex-col gap-5 lg:pt-28">
        <li
          v-for="(point, index) in about.points"
          :key="index"
          class="sticker relative rounded-3xl px-6 py-5 pr-24 text-lg font-semibold shadow-[0_10px_30px_-18px_rgb(37_37_37/0.6)]"
          :class="[STICKERS[index % 4]!.tone, STICKERS[index % 4]!.turn]"
        >
          {{ point }}
          <img
            :src="`/brand/mascots/${STICKERS[index % 4]!.mascot}.webp`"
            alt=""
            class="mascot absolute -top-5 -right-3 h-20 w-auto"
            loading="lazy"
          >
        </li>
      </ul>
    </div>
  </section>
</template>
