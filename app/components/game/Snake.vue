<script setup lang="ts">
import { createSnake, input, SNAKE_COLS, SNAKE_MS, SNAKE_ROWS, step, type SnakeDir, type SnakeState } from "~/games/snake";
import { seeded } from "~/games/rng";
import { SNAKE_SECONDS } from "~~/lib/games/rules";

/**
 * «Змейка»: поле 17×17, еда-звёздочки, партия 90 секунд или до смерти.
 * Стрелки/WASD, крестовина и свайпы. Вкладку спрятали — пауза.
 */
const props = withDefaults(defineProps<{ seed?: number }>(), { seed: () => Date.now() });
const emit = defineEmits<{ finished: [result: { score: number; durationMs: number }] }>();

const snap = ref<SnakeState>(createSnake(seeded(props.seed)));
const rng = seeded(props.seed ^ 0x9e3779b9);
const phase = ref<"ready" | "playing" | "paused">("ready");

let frame = 0;
let last = 0;

const cells = computed(() => {
  const state = snap.value;
  const grid = new Array(SNAKE_COLS * SNAKE_ROWS).fill(0);
  for (const index of state.body) grid[index] = 1;
  grid[state.body[0]!] = 2;
  if (state.alive) grid[state.food] = 3;
  return grid;
});

const left = computed(() => Math.ceil((SNAKE_MS - snap.value.timeMs) / 1000));

function cellClass(value: number): string {
  if (value === 2) return "bg-brand-yellow";
  if (value === 1) return "bg-brand-green";
  if (value === 3) return "bg-brand-orange";
  return "bg-white/70";
}

function loop(moment: number) {
  const dt = Math.min((moment - last) / 1000, 0.05);
  last = moment;
  const result = step(snap.value, Math.round(dt * 1000), rng);
  snap.value = result.state;
  if (result.ate) haptic("tap");
  if (!snap.value.alive) {
    haptic("error");
    emit("finished", { score: snap.value.score, durationMs: snap.value.timeMs });
    return;
  }
  frame = requestAnimationFrame(loop);
}

function play() {
  if (phase.value === "playing") return;
  phase.value = "playing";
  last = performance.now();
  frame = requestAnimationFrame(loop);
}

function pause() {
  if (phase.value !== "playing") return;
  cancelAnimationFrame(frame);
  phase.value = "paused";
}

function steer(dir: SnakeDir) {
  if (phase.value === "ready") play();
  if (phase.value !== "playing") return;
  snap.value = input(snap.value, dir);
}

const KEYS: Record<string, SnakeDir> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
  ц: "up",
  ы: "down",
  ф: "left",
  в: "right",
};
const keyDown = (event: KeyboardEvent) => {
  const dir = KEYS[event.key] ?? KEYS[event.key.toLowerCase()];
  if (!dir) {
    if (event.key === " " || event.key === "Enter") play();
    return;
  }
  event.preventDefault();
  steer(dir);
};

let swipe: { x: number; y: number } | null = null;
function swipeStart(event: PointerEvent) {
  swipe = { x: event.clientX, y: event.clientY };
}
function swipeEnd(event: PointerEvent) {
  if (!swipe) return;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  swipe = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
}

const onVisibility = () => document.hidden && pause();

onMounted(() => {
  window.addEventListener("keydown", keyDown);
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", onVisibility);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  window.removeEventListener("keydown", keyDown);
  window.removeEventListener("blur", pause);
  document.removeEventListener("visibilitychange", onVisibility);
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between text-sm">
      <span>Звёздочек: <strong class="tabular-nums">{{ snap.score }}</strong></span>
      <span>Осталось: <strong class="tabular-nums">{{ left }} с</strong></span>
    </div>

    <div class="relative mx-auto w-full max-w-[min(22rem,calc(100svh_-_26rem))] min-w-60">
      <div
        class="border-ink/10 grid grid-cols-17 grid-rows-17 gap-px rounded-2xl border bg-[#ecece7] p-1.5"
        :style="{ aspectRatio: '1 / 1' }"
        role="img"
        aria-label="Поле змейки"
        @pointerdown="swipeStart"
        @pointerup="swipeEnd"
      >
        <span v-for="(cell, index) in cells" :key="index" class="rounded-[2px]" :class="cellClass(cell)" />
      </div>

      <div
        v-if="phase !== 'playing'"
        class="bg-paper/85 absolute inset-0 grid place-items-center rounded-2xl p-6 text-center backdrop-blur-sm"
      >
        <div class="flex flex-col items-center gap-4">
          <p class="font-display text-2xl">{{ phase === "paused" ? "Пауза" : "Змейка!" }}</p>
          <p class="text-ink-soft max-w-[28ch]">
            Собирайте звёзды и не врезайтесь. {{ SNAKE_SECONDS }}&nbsp;секунд или до первой стены.
          </p>
          <div class="w-48">
            <UiButton @click="play">{{ phase === "paused" ? "Продолжить" : "Начать" }}</UiButton>
          </div>
        </div>
      </div>
    </div>

    <div class="mx-auto grid w-full max-w-[16rem] grid-cols-3 gap-2" role="group" aria-label="Крестовина">
      <span />
      <UiButton variant="ghost" aria-label="Вверх" @click="steer('up')">↑</UiButton>
      <span />
      <UiButton variant="ghost" aria-label="Влево" @click="steer('left')">←</UiButton>
      <UiButton variant="ghost" aria-label="Вниз" @click="steer('down')">↓</UiButton>
      <UiButton variant="ghost" aria-label="Вправо" @click="steer('right')">→</UiButton>
    </div>
  </div>
</template>
