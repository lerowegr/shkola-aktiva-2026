<script setup lang="ts">
import type { LandingCta, LandingStage } from "~/landing/cta";
import { motion } from "~/landing/motion";
import type { SiteContent } from "~~/lib/site/content";

/**
 * «Отбор»: этапы карточками, которые ложатся стопкой при прокрутке —
 * этапы и правда идут друг за другом. Даты и «идёт сейчас» — из базы,
 * а не из текстов: поменяли дату в «Этапах» — она тут же на сайте.
 */
const props = defineProps<{ selection: SiteContent["selection"]; stages: LandingStage[]; cta: LandingCta }>();

const LOOK: Record<LandingStage["kind"], { tone: string; object: string }> = {
  APPLICATION: { tone: "bg-brand-green-soft", object: "cursor-pixel" },
  HOMEWORK: { tone: "bg-brand-yellow-soft", object: "star-pixel" },
  INTERVIEW: { tone: "bg-brand-purple-soft", object: "smile-pixel" },
  RESULTS: { tone: "bg-brand-blue-soft", object: "heart-pixel" },
};

const STATE = {
  open: { label: "Идёт сейчас", class: "bg-ink text-paper" },
  upcoming: { label: "Скоро", class: "bg-card/70 text-ink" },
  closed: { label: "Завершён", class: "bg-card/50 text-ink-soft" },
} as const;

function dates(stage: LandingStage): string {
  const day = (value: string) => mskFormat(value, "d MMMM");
  if (stage.opensAt && stage.closesAt) return `с ${day(stage.opensAt)} по ${day(stage.closesAt)}`;
  if (stage.opensAt) return `с ${day(stage.opensAt)}`;
  if (stage.closesAt) return `до ${day(stage.closesAt)}`;
  return "Даты объявим позже";
}

const showCta = (stage: LandingStage) => stage.kind === "APPLICATION" && stage.state !== "closed";

const section = ref<HTMLElement | null>(null);
let cleanup = () => {};
onMounted(async () => {
  cleanup = await motion(section.value!, ({ gsap }) => {
    // Карточка уходит вглубь, когда на неё ложится следующая.
    const cards = gsap.utils.toArray<HTMLElement>(".stage-card");
    cards.slice(0, -1).forEach((card, index) => {
      gsap.fromTo(
        card,
        { scale: 1, filter: "brightness(1)" },
        {
          scale: 0.94,
          filter: "brightness(0.94)",
          ease: "none",
          scrollTrigger: { trigger: cards[index + 1], start: "top bottom", end: "top 30%", scrub: true },
        },
      );
    });
  });
});
onBeforeUnmount(() => cleanup());
</script>

<template>
  <section id="otbor" ref="section" class="mx-auto max-w-6xl scroll-mt-20 px-4 py-24 sm:py-32">
    <h2 class="font-display text-4xl sm:text-5xl">{{ selection.title }}</h2>
    <p v-if="selection.intro" class="text-ink-soft mt-4 max-w-[60ch] text-lg">{{ selection.intro }}</p>

    <ol class="mt-12 flex flex-col gap-6">
      <li
        v-for="(stage, index) in props.stages"
        :key="stage.id"
        class="sticky"
        :style="{ top: `calc(5rem + ${index * 1.25}rem)` }"
      >
        <article
          class="stage-card border-ink/10 relative grid min-h-[20rem] origin-top gap-6 overflow-hidden rounded-3xl border p-6 sm:min-h-[24rem] sm:grid-cols-[minmax(0,1fr)_auto] sm:p-10"
          :class="LOOK[stage.kind].tone"
        >
          <div class="relative z-10 flex flex-col items-start">
            <span class="rounded-full px-3 py-1 text-sm font-semibold" :class="STATE[stage.state].class">
              {{ STATE[stage.state].label }}
            </span>
            <h3 class="font-display mt-5 text-[clamp(1.75rem,7.5vw,2.25rem)] leading-none sm:text-6xl">{{ stage.title }}</h3>
            <p class="mt-3 text-lg font-semibold">{{ dates(stage) }}</p>
            <p v-if="selection.steps[stage.kind]" class="text-ink/80 mt-4 max-w-[46ch] text-lg">
              {{ selection.steps[stage.kind] }}
            </p>
            <NuxtLink v-if="showCta(stage)" :to="cta.to" class="landing-button landing-button--primary mt-6">
              {{ cta.label }}
            </NuxtLink>
          </div>
          <img
            :src="`/brand/objects/${LOOK[stage.kind].object}.webp`"
            alt=""
            class="pointer-events-none absolute top-5 right-5 w-16 mix-blend-multiply sm:static sm:w-56 sm:self-center"
            loading="lazy"
          >
        </article>
      </li>
    </ol>
  </section>
</template>
