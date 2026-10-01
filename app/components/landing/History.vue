<script setup lang="ts">
import { X } from "lucide-vue-next";

import { motion, prefersReducedMotion } from "~/landing/motion";
import type { SiteContent } from "~~/lib/site/content";
import { latestEvents, timeline } from "~~/lib/site/landing";

/**
 * «История»: на главной — три последних события, целиком — таймлайн на
 * весь экран. Событий может быть десятки: на главной они вытеснили бы
 * остальное. Таймлайн — нативный диалог: фокус внутри, Esc закрывает,
 * страница под ним остаётся на месте.
 */
const props = defineProps<{ history: SiteContent["history"] }>();

const latest = computed(() => latestEvents(props.history.items, 3));
const all = computed(() => timeline(props.history.items));
const more = computed(() => props.history.items.length > 3);

// Годы для быстрого перехода — по одному на каждый встретившийся год.
const years = computed(() => {
  const seen = new Map<string, number>();
  all.value.forEach((item, index) => {
    if (!seen.has(item.year)) seen.set(item.year, index);
  });
  return [...seen.entries()].map(([year, index]) => ({ year, index }));
});

const dialog = ref<HTMLDialogElement | null>(null);
const list = ref<HTMLElement | null>(null);
const open = () => dialog.value?.showModal();
const close = () => dialog.value?.close();
function jump(index: number) {
  const behavior = prefersReducedMotion() ? "instant" : "smooth";
  list.value?.querySelector(`[data-event="${index}"]`)?.scrollIntoView({ behavior, block: "start" });
}

const src = (id: string, width: number) => `/media/site/${id}/${width}.webp`;

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
    <div class="flex flex-wrap items-end justify-between gap-4">
      <h2 class="font-display text-4xl sm:text-5xl">{{ history.title }}</h2>
      <button v-if="more" type="button" class="landing-button landing-button--ghost" @click="open">
        Вся история · {{ history.items.length }}
      </button>
    </div>

    <ol class="mt-12 flex flex-col">
      <li
        v-for="(item, index) in latest"
        :key="index"
        class="event border-ink/10 grid gap-4 border-t py-8 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-8"
      >
        <span class="font-display text-brand-blue text-5xl leading-none sm:text-7xl">{{ item.year }}</span>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-6">
          <div class="flex flex-1 flex-col gap-2 sm:pt-2">
            <h3 v-if="item.title" class="text-2xl font-semibold">{{ item.title }}</h3>
            <p v-if="item.text" class="text-ink-soft max-w-[60ch] text-lg">{{ item.text }}</p>
          </div>
          <img
            v-if="item.photo"
            :src="src(item.photo.id, 480)"
            :srcset="`${src(item.photo.id, 480)} 480w, ${src(item.photo.id, 960)} 960w`"
            sizes="(min-width: 640px) 240px, 100vw"
            :alt="item.photo.alt"
            class="aspect-[4/3] w-full rounded-2xl object-cover sm:w-60"
            loading="lazy"
          >
        </div>
      </li>
    </ol>

    <dialog
      ref="dialog"
      class="timeline bg-paper text-ink m-0 h-dvh max-h-none w-screen max-w-none p-0 backdrop:bg-ink/60"
      aria-labelledby="timeline-title"
      @click.self="close"
    >
      <div class="flex h-full flex-col">
        <header class="border-line bg-paper/95 sticky top-0 z-10 border-b backdrop-blur">
          <div class="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4">
            <h2 id="timeline-title" class="font-display text-2xl sm:text-3xl">{{ history.title }}</h2>
            <button type="button" class="landing-button landing-button--ghost size-11 px-0" aria-label="Закрыть историю" @click="close">
              <X class="size-5" aria-hidden="true" />
            </button>
          </div>
          <nav class="mx-auto flex max-w-5xl gap-2 overflow-x-auto px-4 pb-3" aria-label="Годы">
            <button
              v-for="item in years"
              :key="item.year"
              type="button"
              class="border-ink/15 hover:border-ink/50 shrink-0 rounded-full border px-3 py-1 text-sm font-semibold tabular-nums"
              @click="jump(item.index)"
            >
              {{ item.year }}
            </button>
          </nav>
        </header>

        <ol ref="list" class="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-4 py-8">
          <li
            v-for="(item, index) in all"
            :key="index"
            :data-event="index"
            class="relative grid scroll-mt-32 gap-3 border-l-2 border-brand-blue/30 pb-10 pl-6 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-8 sm:pl-8"
          >
            <span class="bg-brand-blue absolute top-2 -left-[7px] size-3 rounded-full" aria-hidden="true" />
            <span class="font-display text-brand-blue text-4xl leading-none">{{ item.year }}</span>
            <div class="flex flex-col gap-3">
              <h3 v-if="item.title" class="text-xl font-semibold">{{ item.title }}</h3>
              <p v-if="item.text" class="text-ink-soft max-w-[62ch]">{{ item.text }}</p>
              <img
                v-if="item.photo"
                :src="src(item.photo.id, 960)"
                :srcset="`${src(item.photo.id, 480)} 480w, ${src(item.photo.id, 960)} 960w`"
                sizes="(min-width: 640px) 560px, 100vw"
                :alt="item.photo.alt"
                class="aspect-[4/3] w-full max-w-xl rounded-2xl object-cover"
                loading="lazy"
              >
            </div>
          </li>
        </ol>
      </div>
    </dialog>
  </section>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .timeline[open] {
    animation: rise 0.35s cubic-bezier(0.3, 0.7, 0.4, 1);
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(24px);
  }
}
</style>
