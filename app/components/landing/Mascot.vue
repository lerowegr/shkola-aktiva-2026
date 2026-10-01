<script setup lang="ts">
import { MASCOT_EYES, type EyedMascot } from "~/landing/mascot-eyes";

/**
 * Маскот, который смотрит на точку: зрачки сдвигаются внутри белков в её
 * сторону. Точку — указатель, касание или кнопку — даёт родитель в
 * координатах окна. Изредка моргает; `jump` — подпрыгнуть.
 * «Уменьшить движение»: зрачки на месте, без моргания и прыжков.
 */
const props = defineProps<{ name: EyedMascot; target: { x: number; y: number } | null; jump?: boolean }>();

const data = MASCOT_EYES[props.name];
const root = ref<HTMLElement | null>(null);
const offsets = ref(data.eyes.map(() => ({ x: 0, y: 0 })));

// Зрачок — 62% меньшего радиуса белка: как у нарисованных глаз.
const PUPIL = 0.62;

let still = false;

function aim() {
  const rect = root.value?.getBoundingClientRect();
  if (still || !rect || !props.target) {
    offsets.value = data.eyes.map(() => ({ x: 0, y: 0 }));
    return;
  }
  const scale = rect.width / data.width;
  offsets.value = data.eyes.map((eye) => {
    const cx = rect.left + eye.x * scale;
    const cy = rect.top + eye.y * scale;
    const dx = props.target!.x - cx;
    const dy = props.target!.y - cy;
    const length = Math.hypot(dx, dy) || 1;
    // Ход зрачка — до края белка; вблизи цели — меньше, чтобы не косил.
    const reach = Math.min(1, length / 120);
    const travelX = (eye.rx - Math.min(eye.rx, eye.ry) * PUPIL) * scale;
    const travelY = (eye.ry - Math.min(eye.rx, eye.ry) * PUPIL) * scale;
    return { x: (dx / length) * travelX * reach, y: (dy / length) * travelY * reach };
  });
}

watch(() => props.target, aim, { deep: true });

const blinking = ref(false);
let blinkTimer: ReturnType<typeof setTimeout> | null = null;
function scheduleBlink() {
  blinkTimer = setTimeout(
    () => {
      blinking.value = true;
      setTimeout(() => (blinking.value = false), 140);
      scheduleBlink();
    },
    2500 + Math.random() * 4000,
  );
}
onMounted(() => {
  // «Уменьшить движение»: глаза смотрят прямо, не моргают.
  still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  aim();
  if (!still) scheduleBlink();
});
onBeforeUnmount(() => {
  if (blinkTimer) clearTimeout(blinkTimer);
});

const percent = (value: number, of: number) => `${(value / of) * 100}%`;
</script>

<template>
  <span ref="root" class="mascot relative inline-block" :class="{ jump }" aria-hidden="true">
    <img :src="`/brand/mascots/${name}.webp`" alt="" class="block w-full" loading="lazy" draggable="false">
    <span
      v-for="(eye, index) in data.eyes"
      :key="index"
      class="eye absolute grid place-items-center overflow-hidden rounded-[50%] bg-white"
      :class="{ blink: blinking }"
      :style="{
        left: percent(eye.x - eye.rx, data.width),
        top: percent(eye.y - eye.ry, data.height),
        width: percent(eye.rx * 2, data.width),
        height: percent(eye.ry * 2, data.height),
      }"
    >
      <span
        class="pupil bg-ink rounded-full"
        :style="{
          width: percent(Math.min(eye.rx, eye.ry) * PUPIL * 2, eye.rx * 2),
          aspectRatio: '1',
          transform: `translate(${offsets[index]!.x}px, ${offsets[index]!.y}px)`,
        }"
      />
    </span>
  </span>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .pupil {
    transition: transform 0.12s ease-out;
  }
  .eye {
    transition: scale 0.07s;
  }
  .eye.blink {
    scale: 1 0.1;
  }
  .mascot.jump {
    animation: jump 0.5s cubic-bezier(0.3, 1.6, 0.5, 1) infinite alternate;
  }
}

@keyframes jump {
  to {
    translate: 0 -14px;
    rotate: -6deg;
  }
}
</style>
