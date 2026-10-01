<script setup lang="ts">
import { motion } from "~/landing/motion";
import type { SiteContent } from "~~/lib/site/content";

/**
 * «Программа» бенто-сеткой: ровно столько клеток, сколько пунктов, ряды
 * разной ширины, фоны — фактуры брендбука. На телефоне — столбиком.
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
</script>

<template>
  <section id="programma" ref="section" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:py-32">
    <h2 class="font-display text-4xl sm:text-5xl">{{ program.title }}</h2>
    <div class="cells mt-10 grid gap-4 md:grid-cols-6">
      <article
        v-for="(item, index) in program.items"
        :key="index"
        class="cell border-ink/10 relative isolate flex min-h-60 flex-col justify-end overflow-hidden rounded-3xl border p-5 sm:min-h-72 sm:p-7"
        :class="[spans[index], look(index).surface]"
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
        <div :class="look(index).texture && !look(index).dark ? 'bg-card/80 rounded-2xl p-4 backdrop-blur-sm' : ''">
          <h3 class="font-display text-2xl leading-tight hyphens-auto">{{ item.title }}</h3>
          <p v-if="item.text" class="mt-2 max-w-[42ch]" :class="look(index).dark ? 'text-paper/80' : 'text-ink/80'">
            {{ item.text }}
          </p>
        </div>
      </article>
    </div>
  </section>
</template>
