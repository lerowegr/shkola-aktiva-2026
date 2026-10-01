<script setup lang="ts">
import { motion } from "~/landing/motion";
import type { SiteContent } from "~~/lib/site/content";

/** «История»: крупные годы пиксельным шрифтом, события выезжают при прокрутке. */
defineProps<{ history: SiteContent["history"] }>();

const section = ref<HTMLElement | null>(null);
let cleanup = () => {};
onMounted(async () => {
  cleanup = await motion(section.value!, ({ gsap }) => {
    for (const row of gsap.utils.toArray<HTMLElement>(".event")) {
      gsap.from(row, { x: -40, opacity: 0, duration: 0.7, ease: "power3.out", scrollTrigger: { trigger: row, start: "top 85%" } });
    }
  });
});
onBeforeUnmount(() => cleanup());
</script>

<template>
  <section id="istoriya" ref="section" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:py-32">
    <h2 class="font-display text-4xl sm:text-5xl">{{ history.title }}</h2>
    <ol class="mt-12 flex flex-col">
      <li
        v-for="(item, index) in history.items"
        :key="index"
        class="event border-ink/10 grid gap-2 border-t py-8 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-8"
      >
        <span class="font-display text-brand-blue text-5xl leading-none sm:text-7xl">{{ item.year }}</span>
        <div class="flex flex-col gap-2 sm:pt-2">
          <h3 v-if="item.title" class="text-2xl font-semibold">{{ item.title }}</h3>
          <p v-if="item.text" class="text-ink-soft max-w-[60ch] text-lg">{{ item.text }}</p>
        </div>
      </li>
    </ol>
  </section>
</template>
