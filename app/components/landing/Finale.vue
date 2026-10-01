<script setup lang="ts">
import type { LandingCta, LandingStage } from "~/landing/cta";
import { motion, prefersReducedMotion } from "~/landing/motion";

/**
 * Финальный призыв: стикер-логотип крутится в такт прокрутке, вокруг —
 * маскоты, которые следят глазами за указателем и подпрыгивают, когда
 * наводят на кнопку заявки.
 */
const props = defineProps<{ cta: LandingCta; stages: LandingStage[]; telegram: string; closesAt: string | null }>();

const state = computed(() => props.stages.find((stage) => stage.kind === "APPLICATION")?.state ?? "upcoming");
const copy = computed(() => {
  if (state.value === "open") return { title: "Ждём твою анкету", text: "Заполнить можно в несколько заходов: черновик сохраняется сам." };
  if (state.value === "upcoming") {
    return { title: "Зарегистрируйся заранее", text: "Пришлём уведомление, как только анкета откроется." };
  }
  return {
    title: "Приём анкет завершён",
    text: props.telegram ? "Новости о Школе публикуем в Telegram-канале." : "Новости о Школе появятся в кабинете.",
  };
});

// Наведение на кнопку заявки — маскоты подпрыгивают.
const aiming = ref(false);

const section = ref<HTMLElement | null>(null);
let cleanup = () => {};
onMounted(async () => {
  cleanup = await motion(section.value!, ({ gsap }) => {
    const scrub = { trigger: section.value!, start: "top bottom", end: "bottom top", scrub: true };
    gsap.fromTo(".sticker-logo", { rotate: -30 }, { rotate: 30, ease: "none", scrollTrigger: scrub });
  });
});
onBeforeUnmount(() => cleanup());

/*
 * Куда смотрят маскоты: на указатель или последнее касание, а пока их не
 * было (или давно не было) — на кнопку заявки. Считаем раз в кадр и только
 * пока финал на экране.
 */
const target = ref<{ x: number; y: number } | null>(null);
let pointer: { x: number; y: number; at: number } | null = null;
let frame = 0;
let watching = false;

function look() {
  const fresh = pointer && performance.now() - pointer.at < 4000;
  if (fresh) {
    target.value = { x: pointer!.x, y: pointer!.y };
  } else {
    const button = section.value?.querySelector(".panel a")?.getBoundingClientRect();
    target.value = button ? { x: button.left + button.width / 2, y: button.top + button.height / 2 } : null;
  }
  if (watching) frame = requestAnimationFrame(look);
}

const onPointer = (event: PointerEvent) => (pointer = { x: event.clientX, y: event.clientY, at: performance.now() });
let visibility: IntersectionObserver | null = null;

onMounted(() => {
  // «Уменьшить движение»: маскоты не следят — ни слушателей, ни цикла кадров.
  if (prefersReducedMotion()) return;
  window.addEventListener("pointermove", onPointer, { passive: true });
  window.addEventListener("pointerdown", onPointer, { passive: true });
  visibility = new IntersectionObserver(([entry]) => {
    watching = Boolean(entry?.isIntersecting);
    cancelAnimationFrame(frame);
    if (watching) frame = requestAnimationFrame(look);
  });
  visibility.observe(section.value!);
});
onBeforeUnmount(() => {
  window.removeEventListener("pointermove", onPointer);
  window.removeEventListener("pointerdown", onPointer);
  visibility?.disconnect();
  cancelAnimationFrame(frame);
});

const MASCOTS = [
  { name: "green", place: "-top-6 -left-16 w-24 -rotate-12 sm:-left-28 sm:w-32" },
  { name: "purple", place: "-top-4 -right-16 w-24 rotate-12 sm:-right-28 sm:w-32" },
  { name: "blue-a", place: "-bottom-6 -left-14 w-24 rotate-6 sm:-left-24 sm:w-28" },
  { name: "yellow-b", place: "-bottom-4 -right-14 w-24 -rotate-6 sm:-right-24 sm:w-28" },
] as const;
</script>

<template>
  <section ref="section" class="relative overflow-hidden py-24 sm:py-32">
    <div class="relative mx-auto flex max-w-3xl flex-col items-center gap-8 px-4 text-center">
      <div class="relative">
        <img
          src="/brand/logo-sticker.webp"
          alt="Логотип Школы Актива 2026"
          width="320"
          height="320"
          class="sticker-logo size-56 rounded-full shadow-[0_24px_60px_-24px_rgb(37_37_37/0.55)] sm:size-80"
          loading="lazy"
        >
        <span v-for="mascot in MASCOTS" :key="mascot.name" class="absolute" :class="mascot.place">
          <LandingMascot :name="mascot.name" :target="target" :jump="aiming" class="w-full" />
        </span>
      </div>
      <h2 class="font-display text-4xl sm:text-6xl">{{ copy.title }}</h2>
      <p class="text-ink-soft max-w-[40ch] text-lg sm:text-xl">{{ copy.text }}</p>
      <LandingCtaPanel :cta="cta" :closes-at="closesAt" size="md" class="mt-2" @aim="aiming = $event" />
      <a
        v-if="state === 'closed' && telegram"
        :href="telegram"
        target="_blank"
        rel="noopener"
        class="landing-button landing-button--ghost"
      >
        Telegram-канал
      </a>
    </div>
  </section>
</template>
