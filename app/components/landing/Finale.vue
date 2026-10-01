<script setup lang="ts">
import type { LandingCta, LandingStage } from "~/landing/cta";
import { motion } from "~/landing/motion";

/** Финальный призыв: стикер-логотип крутится в такт прокрутке, маскоты выглядывают. */
const props = defineProps<{ cta: LandingCta; stages: LandingStage[]; telegram: string }>();

const state = computed(() => props.stages.find((stage) => stage.kind === "APPLICATION")?.state ?? "upcoming");
const copy = computed(() => {
  if (state.value === "open") return { title: "Ждём твою анкету", text: `${props.cta.status}. Заполнить можно в несколько заходов.` };
  if (state.value === "upcoming") {
    return { title: "Зарегистрируйся заранее", text: "Пришлём уведомление, как только анкета откроется." };
  }
  return {
    title: "Приём анкет завершён",
    text: props.telegram ? "Новости о Школе публикуем в Telegram-канале." : "Новости о Школе появятся в кабинете.",
  };
});

const section = ref<HTMLElement | null>(null);
let cleanup = () => {};
onMounted(async () => {
  cleanup = await motion(section.value!, ({ gsap }) => {
    const scrub = { trigger: section.value!, start: "top bottom", end: "bottom top", scrub: true };
    gsap.fromTo(".sticker-logo", { rotate: -30 }, { rotate: 30, ease: "none", scrollTrigger: scrub });
    gsap.fromTo(".peek-left", { x: -60, rotate: -20 }, { x: 0, rotate: 0, ease: "none", scrollTrigger: { ...scrub, end: "center center" } });
    gsap.fromTo(".peek-right", { x: 60, rotate: 20 }, { x: 0, rotate: 0, ease: "none", scrollTrigger: { ...scrub, end: "center center" } });
  });
});
onBeforeUnmount(() => cleanup());
</script>

<template>
  <section ref="section" class="relative overflow-hidden py-24 sm:py-32">
    <img src="/brand/mascots/green-angry.webp" alt="" class="peek-left absolute top-[6%] -left-8 w-28 sm:w-36 lg:left-[6%]" loading="lazy">
    <img src="/brand/mascots/orange.webp" alt="" class="peek-right absolute -right-8 bottom-[4%] w-28 sm:w-36 lg:right-[6%]" loading="lazy">
    <div class="relative mx-auto flex max-w-3xl flex-col items-center gap-8 px-4 text-center">
      <img
        src="/brand/logo-sticker.webp"
        alt="Логотип Школы Актива 2026"
        width="320"
        height="320"
        class="sticker-logo size-60 rounded-full shadow-[0_24px_60px_-24px_rgb(37_37_37/0.55)] sm:size-80"
        loading="lazy"
      >
      <h2 class="font-display text-4xl sm:text-6xl">{{ copy.title }}</h2>
      <p class="text-ink-soft max-w-[40ch] text-lg sm:text-xl">{{ copy.text }}</p>
      <div class="flex flex-wrap justify-center gap-3">
        <NuxtLink :to="cta.to" class="landing-button landing-button--primary">{{ cta.label }}</NuxtLink>
        <a v-if="state === 'closed' && telegram" :href="telegram" target="_blank" rel="noopener" class="landing-button landing-button--ghost">
          Telegram-канал
        </a>
      </div>
    </div>
  </section>
</template>
