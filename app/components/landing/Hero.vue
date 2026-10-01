<script setup lang="ts">
import type { LandingCta } from "~/landing/cta";
import { motion, prefersReducedMotion } from "~/landing/motion";
import { webglAvailable } from "~/landing/support";
import type { VoxelScene } from "~/landing/voxel-scene";

/**
 * Первый экран: название Школы живым текстом шрифтами бренда и вокруг —
 * стеклянные пиксельные объекты в 3D. Объекты следуют за указателем,
 * крутятся от нажатия и разлетаются, когда экран уезжает при прокрутке.
 *
 * three.js грузится только здесь и только в браузере. Нет WebGL — те же
 * объекты картинками. «Уменьшить движение» — один неподвижный кадр.
 */
defineProps<{ cta: LandingCta; tagline: string; closesAt: string | null }>();

const hero = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const ready = ref(false);
const fallback = ref(false);

let scene: VoxelScene | null = null;
const cleanups: (() => void)[] = [];

onMounted(async () => {
  if (!webglAvailable()) {
    fallback.value = true;
    return;
  }
  try {
    const { createVoxelScene } = await import("~/landing/voxel-scene");
    scene = createVoxelScene({ canvas: canvas.value!, background: "#fdfdfb", reducedMotion: prefersReducedMotion() });
  } catch (error) {
    console.warn("3D не запустилось, показываем картинки", error);
    fallback.value = true;
    return;
  }
  const live = scene;
  requestAnimationFrame(() => (ready.value = true));

  // Кадры — только пока герой на экране и вкладка открыта.
  let visible = true;
  const sync = () => (visible && !document.hidden ? live.start() : live.stop());
  const observer = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    sync();
  });
  observer.observe(hero.value!);
  document.addEventListener("visibilitychange", sync);
  const resize = new ResizeObserver(() => live.resize());
  resize.observe(canvas.value!);

  // Указатель — только мышь: на телефоне палец и так двигает страницу.
  const onPointer = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    live.pointer((event.clientX / window.innerWidth) * 2 - 1, -((event.clientY / window.innerHeight) * 2 - 1));
  };
  window.addEventListener("pointermove", onPointer, { passive: true });

  cleanups.push(
    () => observer.disconnect(),
    () => resize.disconnect(),
    () => document.removeEventListener("visibilitychange", sync),
    () => window.removeEventListener("pointermove", onPointer),
  );

  cleanups.push(
    await motion(hero.value!, ({ ScrollTrigger }) => {
      ScrollTrigger.create({
        trigger: hero.value!,
        start: "top top",
        end: "bottom top",
        scrub: true,
        onUpdate: (self) => live.scroll(self.progress),
      });
    }),
  );
});

function poke(event: PointerEvent) {
  if ((event.target as HTMLElement).closest("a, button")) return;
  scene?.poke(event.clientX, event.clientY);
}

onBeforeUnmount(() => {
  for (const cleanup of cleanups) cleanup();
  scene?.dispose();
  scene = null;
});

const LETTERS = [..."ШКОЛА"];

// Запасной вариант без WebGL: те же объекты брендбука картинками.
const FALLBACK = [
  { src: "/brand/objects/heart-pixel.webp", class: "left-[4%] top-[14%] w-[18vw] max-w-56 -rotate-12" },
  { src: "/brand/objects/asterisk-glass.webp", class: "right-[6%] top-[16%] w-[15vw] max-w-48 rotate-12" },
  { src: "/brand/objects/moon-glass.webp", class: "left-[8%] bottom-[12%] w-[13vw] max-w-40 rotate-6" },
  { src: "/brand/objects/lightning-glass.webp", class: "right-[10%] bottom-[14%] w-[9vw] max-w-28 -rotate-6" },
];
</script>

<template>
  <!--
    Выделение текста на первом экране выключено: по нему тыкают в 3D-объекты,
    и двойной клик или долгое касание иначе заливали бы страницу выделением.
    Подзаголовок и плашку заявки по-прежнему можно выделить и скопировать.
  -->
  <section ref="hero" class="hero relative isolate overflow-hidden select-none" @pointerdown="poke">
    <canvas
      ref="canvas"
      class="absolute inset-0 -z-10 size-full transition-opacity duration-700 [-webkit-tap-highlight-color:transparent]"
      :class="ready ? 'opacity-100' : 'opacity-0'"
      aria-hidden="true"
    />
    <div v-if="fallback" class="absolute inset-0 -z-10" aria-hidden="true">
      <img
        v-for="item in FALLBACK"
        :key="item.src"
        :src="item.src"
        alt=""
        class="absolute h-auto"
        :class="item.class"
        loading="lazy"
      >
    </div>

    <div class="mx-auto flex min-h-[100svh] max-w-6xl flex-col items-center justify-center gap-6 px-4 pt-24 pb-16 text-center">
      <h1 class="wordmark pointer-events-none flex flex-col items-center select-none" aria-label="Школа Актива 2026">
        <span aria-hidden="true" class="font-display mt-[0.12em] text-[clamp(64px,17vw,200px)] leading-[0.9]">
          <span v-for="(letter, index) in LETTERS" :key="index" class="letter" :style="{ '--i': index }">{{ letter }}</span>
        </span>
        <span aria-hidden="true" class="script font-script -mt-[0.62em] pl-[0.5em] text-[clamp(58px,14vw,168px)] leading-[1.15]">
          актива
        </span>
        <span aria-hidden="true" class="year font-script -mt-[0.55em] text-[clamp(30px,5.5vw,64px)] leading-none">2026</span>
      </h1>

      <p class="text-ink-soft max-w-[34ch] text-lg text-pretty select-text sm:text-xl">{{ tagline }}</p>

      <LandingCtaPanel :cta="cta" :closes-at="closesAt" class="mt-2" />
      <a href="#otbor" class="text-ink-soft hover:text-ink text-sm font-medium underline-offset-4 hover:underline">
        Как проходит отбор
      </a>
    </div>
  </section>
</template>

<style scoped>
/* Долгое касание на iPhone не открывает меню «Скопировать». */
.hero {
  -webkit-touch-callout: none;
}

.wordmark .letter {
  display: inline-block;
}

@media (prefers-reduced-motion: no-preference) {
  /* Буквы падают ступеньками — как пиксельный шрифт, без плавности. */
  .wordmark .letter {
    animation: drop 0.55s steps(5, end) both;
    animation-delay: calc(var(--i) * 80ms + 120ms);
  }

  /* «актива» пишется слева направо. Запас по краям — чтобы росчерки не обрезались. */
  .wordmark .script {
    animation: write 1.1s cubic-bezier(0.6, 0.1, 0.3, 1) 0.6s both;
  }

  .wordmark .year {
    animation: fade 0.6s ease-out 1.4s both;
  }
}

@keyframes drop {
  from {
    transform: translateY(-0.6em);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}

@keyframes write {
  from {
    clip-path: inset(-30% 110% -40% -20%);
  }
  to {
    clip-path: inset(-30% -20% -40% -20%);
  }
}

@keyframes fade {
  from {
    opacity: 0;
    transform: translateY(0.3em);
  }
}
</style>
