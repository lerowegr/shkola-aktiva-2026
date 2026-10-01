<script setup lang="ts">
import { motion, prefersReducedMotion } from "~/landing/motion";
import { webglAvailable } from "~/landing/support";
import type { VoxelScene } from "~/landing/voxel-scene";

/**
 * Перебивка между «Отбором» и «Программой»: экран на время прокрутки
 * замирает, стеклянные объекты первого экрана слетаются по кругу — туда,
 * где они на стикере, — тают, и вырастает сам стикер-логотип. Связывает
 * начало страницы с её серединой.
 *
 * Сцена создаётся, только когда секция близко к экрану, и рисует кадр лишь
 * на прокрутке. Без WebGL и при «уменьшить движение» — неподвижный стикер
 * с объектами вокруг.
 */
const section = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const animated = ref(false);

let scene: VoxelScene | null = null;
let progress = 0;
const cleanups: (() => void)[] = [];

onMounted(async () => {
  if (prefersReducedMotion() || !webglAvailable()) return;
  animated.value = true;
  await nextTick();

  const observer = new IntersectionObserver(
    async ([entry]) => {
      if (!entry?.isIntersecting || scene || !canvas.value) return;
      const { createVoxelScene } = await import("~/landing/voxel-scene");
      scene = createVoxelScene({ canvas: canvas.value, background: "#fdfdfb", reducedMotion: false, mode: "assemble" });
      scene.scroll(progress);
    },
    { rootMargin: "100% 0px" },
  );
  observer.observe(section.value!);
  const resize = new ResizeObserver(() => scene?.resize());
  resize.observe(canvas.value!);
  cleanups.push(
    () => observer.disconnect(),
    () => resize.disconnect(),
  );

  cleanups.push(
    await motion(section.value!, ({ gsap }) => {
      const timeline = gsap.timeline({
        scrollTrigger: {
          trigger: section.value!,
          start: "top top",
          end: "+=150%",
          pin: true,
          scrub: true,
          onUpdate: (self) => {
            progress = self.progress;
            scene?.scroll(progress);
          },
        },
      });
      timeline.to({}, { duration: 1 }, 0);
      timeline.fromTo(
        ".sticker",
        { scale: 0.55, opacity: 0, rotate: -25 },
        { scale: 1, opacity: 1, rotate: 0, ease: "power2.out", duration: 0.32 },
        0.66,
      );
    }),
  );
});

onBeforeUnmount(() => {
  for (const cleanup of cleanups) cleanup();
  scene?.dispose();
  scene = null;
});

// Без 3D: те же объекты брендбука картинками вокруг стикера.
const STATIC = [
  { src: "/brand/objects/asterisk-glass.webp", class: "left-[6%] top-[8%] w-[22%] -rotate-12" },
  { src: "/brand/objects/heart-pixel.webp", class: "right-[4%] top-[12%] w-[24%] rotate-12" },
  { src: "/brand/objects/moon-glass.webp", class: "left-[2%] bottom-[10%] w-[20%] rotate-6" },
  { src: "/brand/objects/lightning-glass.webp", class: "right-[10%] bottom-[6%] w-[12%] -rotate-6" },
];
</script>

<template>
  <section ref="section" class="relative overflow-hidden" :class="animated ? 'h-[100svh]' : 'py-20'" aria-label="Школа Актива 2026">
    <canvas v-if="animated" ref="canvas" class="absolute inset-0 size-full" aria-hidden="true" />
    <div class="grid place-items-center" :class="animated ? 'absolute inset-0' : 'px-4'">
      <div class="relative">
        <template v-if="!animated">
          <img
            v-for="item in STATIC"
            :key="item.src"
            :src="item.src"
            alt=""
            class="absolute z-10 h-auto"
            :class="item.class"
            loading="lazy"
          >
        </template>
        <img
          src="/brand/logo-sticker.webp"
          alt="Логотип Школы Актива 2026"
          width="520"
          height="520"
          class="sticker size-[min(70vmin,520px)] rounded-full shadow-[0_30px_80px_-30px_rgb(37_37_37/0.5)]"
          loading="lazy"
        >
      </div>
    </div>
  </section>
</template>
