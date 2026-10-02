<script setup lang="ts">
import { motion, prefersReducedMotion } from "~/landing/motion";
import type { SiteContent } from "~~/lib/site/content";
import { latestEvents } from "~~/lib/site/landing";

/**
 * «История» — вертикальный таймлайн. На широком экране линия посередине,
 * события чередуются: год с одной стороны, рассказ с другой. На телефоне
 * линия слева, всё справа. Свежие сверху: раскрытие дописывает старые
 * события ниже, а не сдвигает прочитанное.
 *
 * На главной — шесть событий, остальные раскрываются на месте тем же видом.
 * Ряд годов переводит к нужному году и сам раскрывает историю. Линия
 * заливается по прокрутке, точка загорается, когда до события дошли.
 */
const props = defineProps<{ history: SiteContent["history"] }>();

const LIMIT = 6;
const events = computed(() => latestEvents(props.history.items, props.history.items.length));
const hidden = computed(() => Math.max(0, events.value.length - LIMIT));
const expanded = ref(false);

// Годы для перехода — по одному на каждый встретившийся год.
const years = computed(() => {
  const seen = new Map<string, number>();
  events.value.forEach((item, index) => {
    if (!seen.has(item.year)) seen.set(item.year, index);
  });
  return [...seen.entries()].map(([year, index]) => ({ year, index }));
});

const section = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);
const animated = ref(false);
let refresh = () => {};

const behavior = (): ScrollBehavior => (prefersReducedMotion() ? "instant" : "smooth");

async function toggle() {
  expanded.value = !expanded.value;
  await nextTick();
  refresh();
  if (!expanded.value) section.value?.scrollIntoView({ behavior: behavior(), block: "start" });
}

async function jump(index: number) {
  if (index >= LIMIT && !expanded.value) {
    expanded.value = true;
    await nextTick();
    refresh();
  }
  list.value?.querySelector(`[data-event="${index}"]`)?.scrollIntoView({ behavior: behavior(), block: "center" });
}

const src = (id: string, width: number) => `/media/site/${id}/${width}.webp`;

let cleanup = () => {};
onMounted(async () => {
  cleanup = await motion(section.value!, ({ gsap, ScrollTrigger }) => {
    animated.value = true;
    refresh = () => ScrollTrigger.refresh();
    gsap.fromTo(
      ".rail-fill",
      { scaleY: 0 },
      { scaleY: 1, ease: "none", scrollTrigger: { trigger: list.value!, start: "top 60%", end: "bottom 60%", scrub: 0.3 } },
    );
    // Год и рассказ выезжают каждый со своей стороны линии; на телефоне всё справа.
    const wide = window.matchMedia("(min-width: 768px)").matches;
    for (const row of gsap.utils.toArray<HTMLElement>(".event")) {
      ScrollTrigger.create({ trigger: row, start: "top 60%", toggleClass: { targets: row, className: "is-lit" } });
      for (const part of row.querySelectorAll<HTMLElement>(".reveal")) {
        gsap.from(part, {
          x: wide && part.dataset.from === "left" ? -40 : 40,
          opacity: 0,
          duration: 0.7,
          ease: "power3.out",
          scrollTrigger: { trigger: row, start: "top 85%" },
        });
      }
    }
  });
});
onBeforeUnmount(() => cleanup());
</script>

<template>
  <section id="istoriya" ref="section" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:py-32">
    <h2 class="font-display text-4xl sm:text-5xl">{{ history.title }}</h2>
    <nav v-if="hidden > 0 && years.length > 1" class="mt-6 -mx-4 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Годы истории">
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

    <ol id="history-events" ref="list" class="timeline relative mt-12" :class="{ animated }">
      <span v-if="events.length > 1" class="rail bg-ink/10 absolute top-3 bottom-3 w-0.5" aria-hidden="true">
        <span class="rail-fill bg-brand-blue block size-full origin-top" />
      </span>
      <li
        v-for="(item, index) in events"
        v-show="expanded || index < LIMIT"
        :key="index"
        :data-event="index"
        class="event relative grid scroll-mt-28 grid-cols-[1.75rem_minmax(0,1fr)] gap-x-4 gap-y-3 pb-14 last:pb-0 md:grid-cols-[minmax(0,1fr)_3rem_minmax(0,1fr)] md:gap-x-6"
      >
        <span v-if="events.length > 1" class="dot col-start-1 row-start-1 mt-3 size-4 justify-self-center rounded-full border-2 md:col-start-2" aria-hidden="true" />
        <!-- У Konkovo цифры на 0.15em выше заявленной строки: без отступа
             Safari обрезает их верх, пока год выезжает (слой по рамке). -->
        <span
          class="reveal font-display text-brand-blue col-start-2 row-start-1 pt-[0.15em] text-5xl leading-none sm:text-6xl"
          :class="index % 2 ? 'md:col-start-3' : 'md:col-start-1 md:text-right'"
          :data-from="index % 2 ? 'right' : 'left'"
        >
          {{ item.year }}
        </span>
        <div
          class="reveal col-start-2 row-start-2 flex max-w-lg flex-col gap-3 md:row-start-1"
          :class="index % 2 ? 'md:col-start-1 md:items-end md:justify-self-end md:text-right' : 'md:col-start-3'"
          :data-from="index % 2 ? 'left' : 'right'"
        >
          <h3 v-if="item.title" class="text-2xl font-semibold">{{ item.title }}</h3>
          <p v-if="item.text" class="text-ink-soft text-lg">{{ item.text }}</p>
          <img
            v-if="item.photo"
            :src="src(item.photo.id, 960)"
            :srcset="`${src(item.photo.id, 480)} 480w, ${src(item.photo.id, 960)} 960w`"
            sizes="(min-width: 768px) 512px, 100vw"
            :alt="item.photo.alt"
            class="aspect-[4/3] w-full rounded-2xl object-cover"
            loading="lazy"
          >
        </div>
      </li>
    </ol>

    <div v-if="hidden > 0" class="mt-12 flex justify-center">
      <button
        type="button"
        class="landing-button landing-button--ghost"
        :aria-expanded="expanded"
        aria-controls="history-events"
        @click="toggle"
      >
        {{ expanded ? "Свернуть историю" : `Вся история · ещё ${hidden}` }}
      </button>
    </div>
  </section>
</template>

<style scoped>
/* Линия: на телефоне — по центру колонки точек, на широком — посередине. */
.rail {
  left: calc(0.875rem - 1px);
}
@media (min-width: 768px) {
  .rail {
    left: calc(50% - 1px);
  }
}

/* Без анимации линия залита и все точки горят; с ней — загораются по прокрутке. */
.dot {
  border-color: var(--color-brand-blue);
  background: var(--color-brand-blue);
  box-shadow: 0 0 0 6px var(--color-paper);
}
.animated .dot {
  border-color: rgb(37 37 37 / 0.2);
  background: var(--color-paper);
  transition:
    background-color 0.3s,
    border-color 0.3s,
    transform 0.3s cubic-bezier(0.3, 1.6, 0.5, 1);
}
.animated .is-lit .dot {
  border-color: var(--color-brand-blue);
  background: var(--color-brand-blue);
  transform: scale(1.25);
}
</style>
