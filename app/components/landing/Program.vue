<script setup lang="ts">
import { RotateCw } from "lucide-vue-next";

import { motion } from "~/landing/motion";
import type { SiteContent } from "~~/lib/site/content";

/**
 * «Программа» бенто-сеткой: ровно столько клеток, сколько пунктов, ряды
 * разной ширины, фоны — фактуры брендбука. На телефоне — столбиком.
 *
 * Карточки парят; нажатие переворачивает карточку, на обороте — описание.
 * Без описания карточка не кнопка и не переворачивается.
 */
const props = defineProps<{ program: SiteContent["program"] }>();

// Ряды по два пункта разной ширины; одиночка в конце — на всю ширину.
const ROWS: [number, number][] = [
  [4, 2],
  [2, 4],
  [3, 3],
  [2, 4],
];
const SPAN: Record<number, string> = { 2: "md:col-span-2", 3: "md:col-span-3", 4: "md:col-span-4", 6: "md:col-span-6" };

const spans = computed(() => {
  const result: number[] = [];
  let row = 0;
  while (result.length < props.program.items.length) {
    if (props.program.items.length - result.length === 1) result.push(6);
    else result.push(...ROWS[row++ % ROWS.length]!);
  }
  return result.map((span) => SPAN[span]);
});

interface Look {
  surface: string;
  texture?: string;
  /** Тёмная фактура — светлый текст прямо на ней. */
  dark?: boolean;
  object?: string;
}
const LOOKS: Look[] = [
  { surface: "bg-paper", texture: "paper", object: "flame-glass" },
  { surface: "bg-ink text-paper", texture: "tiles", dark: true, object: "asterisk-glass" },
  { surface: "bg-brand-green-soft", object: "cloud-glass" },
  { surface: "bg-paper", texture: "glitch" },
  { surface: "bg-brand-yellow-soft", object: "star-glass" },
  { surface: "bg-paper", texture: "halftone" },
  { surface: "bg-brand-purple-soft", object: "moon-glass-white" },
  { surface: "bg-brand-blue-soft", object: "heart-glass" },
];
const look = (index: number) => LOOKS[index % LOOKS.length]!;

const section = ref<HTMLElement | null>(null);
let cleanup = () => {};
onMounted(async () => {
  cleanup = await motion(section.value!, ({ gsap }) => {
    gsap.from(".cell", {
      y: 60,
      opacity: 0,
      duration: 0.8,
      stagger: 0.08,
      ease: "power3.out",
      scrollTrigger: { trigger: ".cells", start: "top 82%" },
    });
  });
});
onBeforeUnmount(() => cleanup());

const flipped = ref<Record<number, boolean>>({});
const toggle = (index: number) => (flipped.value = { ...flipped.value, [index]: !flipped.value[index] });
</script>

<template>
  <section id="programma" ref="section" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:py-32">
    <h2 class="font-display text-4xl sm:text-5xl">{{ program.title }}</h2>
    <p v-if="program.items.some((item) => item.text)" class="text-ink-soft mt-3">Нажми на карточку — расскажем подробнее.</p>
    <div class="cells mt-10 grid gap-4 md:grid-cols-6">
      <div v-for="(item, index) in program.items" :key="index" class="cell [perspective:1400px]" :class="spans[index]">
        <component
          :is="item.text ? 'button' : 'div'"
          :type="item.text ? 'button' : undefined"
          class="card focus-visible:ring-accent/40 block h-full w-full rounded-3xl text-left outline-none focus-visible:ring-4"
          :class="{ flipped: flipped[index] }"
          :aria-pressed="item.text ? Boolean(flipped[index]) : undefined"
          @click="item.text && toggle(index)"
        >
          <span class="float block h-full" :style="{ '--delay': `${-(index * 1.3) % 5}s` }">
            <span class="inner relative block h-full min-h-60 sm:min-h-72">
              <!-- Лицо: фактура, объект, заголовок. -->
              <span
                class="face border-ink/10 absolute inset-0 isolate flex flex-col justify-end overflow-hidden rounded-3xl border p-5 sm:p-7"
                :class="look(index).surface"
              >
                <img
                  v-if="look(index).texture"
                  :src="`/brand/textures/${look(index).texture}.webp`"
                  alt=""
                  class="absolute inset-0 -z-10 size-full object-cover"
                  loading="lazy"
                >
                <img
                  v-if="look(index).object"
                  :src="`/brand/objects/${look(index).object}.webp`"
                  alt=""
                  class="absolute -top-6 -right-6 -z-10 w-28 sm:w-32"
                  :class="{ 'mix-blend-multiply': !look(index).dark }"
                  loading="lazy"
                >
                <span
                  class="flex items-end justify-between gap-3"
                  :class="look(index).texture && !look(index).dark ? 'bg-card/80 rounded-2xl p-4 backdrop-blur-sm' : ''"
                >
                  <span class="font-display text-2xl leading-tight hyphens-auto">{{ item.title }}</span>
                  <RotateCw v-if="item.text" class="mb-1 size-5 shrink-0 opacity-60" aria-hidden="true" />
                </span>
              </span>
              <!-- Оборот: описание. -->
              <span
                v-if="item.text"
                class="face back bg-ink text-paper border-ink absolute inset-0 flex flex-col justify-between gap-4 overflow-hidden rounded-3xl border p-5 sm:p-7"
              >
                <span class="font-display text-paper/60 text-lg leading-tight">{{ item.title }}</span>
                <span class="text-lg leading-snug sm:text-xl">{{ item.text }}</span>
              </span>
            </span>
          </span>
        </component>
      </div>
    </div>
  </section>
</template>

<style scoped>
.inner {
  transform-style: preserve-3d;
}
.face {
  backface-visibility: hidden;
}
.back {
  transform: rotateY(180deg);
}
.flipped .inner {
  transform: rotateY(180deg);
}

@media (prefers-reduced-motion: no-preference) {
  .inner {
    transition: transform 0.7s cubic-bezier(0.3, 0.7, 0.3, 1);
  }
  /* Парят вразнобой: у каждой карточки своя фаза. */
  .float {
    animation: float 5s ease-in-out infinite;
    animation-delay: var(--delay);
  }
  .card:hover .float,
  .card:focus-visible .float {
    animation-play-state: paused;
  }
}

@keyframes float {
  50% {
    transform: translateY(-8px);
  }
}
</style>
