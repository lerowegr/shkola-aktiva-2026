<script setup lang="ts">
import {
  cellsOf,
  COLS,
  createTetris,
  ghostY,
  hardDrop,
  PIECE_TYPES,
  ROWS,
  TETRIS_MS,
  tick,
  tryMove,
  tryRotate,
  type TetrisState,
} from "~/games/tetris";
import { seeded } from "~/games/rng";
import { TETRIS_SECONDS } from "~~/lib/games/rules";

/**
 * «Тетрис»: стакан 10×20, фигуры в цветах бренда, партия две минуты.
 * Стрелки и Space — с клавиатуры, ряд кнопок — пальцем. Вкладку спрятали —
 * пауза: время партии игровое и на паузе не идёт.
 */
const emit = defineEmits<{ finished: [result: { score: number; durationMs: number }] }>();

// Цвета фигур — палитра бренда (порядок PIECE_TYPES: I O T S Z J L).
const COLORS = ["#1c63ff", "#ffcc00", "#be2aff", "#2ce718", "#f60301", "#ff8511", "#252525"];

const snap = ref<TetrisState>(createTetris(seeded(Date.now())));
const rng = seeded(Date.now() ^ Math.floor(Math.random() * 2 ** 31));
const phase = ref<"ready" | "playing" | "paused">("ready");
const soft = ref(false);

let frame = 0;
let last = 0;

/** Стакан с фигурой и призраком: 0 — пусто, -1 — призрак, иначе номер фигуры. */
const cells = computed(() => {
  const state = snap.value;
  const grid = [...state.board];
  const active = state.active;
  if (active) {
    const shadow = ghostY(state);
    for (const [dx, dy] of cellsOf(active.type, active.rot)) {
      const col = active.x + dx;
      const row = shadow + dy;
      if (row >= 0 && row < ROWS && col >= 0 && col < COLS && grid[row * COLS + col] === 0) {
        grid[row * COLS + col] = -1;
      }
    }
    const value = PIECE_TYPES.indexOf(active.type) + 1;
    for (const [dx, dy] of cellsOf(active.type, active.rot)) {
      const col = active.x + dx;
      const row = active.y + dy;
      if (row >= 0 && row < ROWS && col >= 0 && col < COLS) grid[row * COLS + col] = value;
    }
  }
  return grid;
});

const left = computed(() => Math.ceil((TETRIS_MS - snap.value.timeMs) / 1000));

function cellStyle(value: number): Record<string, string> {
  if (value === 0) return {};
  if (value === -1) return { boxShadow: "inset 0 0 0 1px #25252533" };
  return { background: COLORS[value - 1] ?? "#252525" };
}

function loop(now: number) {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const step = tick(snap.value, Math.round(dt * 1000), rng, soft.value);
  snap.value = step.state;
  if (step.locked) haptic(step.cleared > 0 ? "success" : "tap");
  if (snap.value.over) {
    haptic("success");
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
  soft.value = false;
  phase.value = "paused";
}

function drop() {
  if (phase.value !== "playing") return;
  snap.value = hardDrop(snap.value, rng);
  haptic("tap");
  if (snap.value.over) {
    cancelAnimationFrame(frame);
    emit("finished", { score: snap.value.score, durationMs: snap.value.timeMs });
  }
}

function onKey(event: KeyboardEvent, down: boolean) {
  if (phase.value !== "playing") {
    if (down && (event.key === " " || event.key === "Enter")) play();
    else return;
    event.preventDefault();
    return;
  }
  if (!down) {
    if (event.key === "ArrowDown") soft.value = false;
    return;
  }
  switch (event.key) {
    case "ArrowLeft":
      snap.value = tryMove(snap.value, -1, 0);
      break;
    case "ArrowRight":
      snap.value = tryMove(snap.value, 1, 0);
      break;
    case "ArrowDown":
      soft.value = true;
      break;
    case "ArrowUp":
    case "x":
    case "X":
    case "ч":
    case "Ч":
      snap.value = tryRotate(snap.value, 1);
      break;
    case "z":
    case "Z":
    case "я":
    case "Я":
      snap.value = tryRotate(snap.value, -1);
      break;
    case " ":
      drop();
      break;
    case "p":
    case "P":
    case "з":
    case "З":
    case "Escape":
      pause();
      break;
    default:
      return;
  }
  event.preventDefault();
}
const keyDown = (event: KeyboardEvent) => onKey(event, true);
const keyUp = (event: KeyboardEvent) => onKey(event, false);
const onVisibility = () => document.hidden && pause();

onMounted(() => {
  window.addEventListener("keydown", keyDown);
  window.addEventListener("keyup", keyUp);
  window.addEventListener("blur", pause);
  document.addEventListener("visibilitychange", onVisibility);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  window.removeEventListener("keydown", keyDown);
  window.removeEventListener("keyup", keyUp);
  window.removeEventListener("blur", pause);
  document.removeEventListener("visibilitychange", onVisibility);
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between text-sm">
      <span>Очки: <strong class="tabular-nums">{{ snap.score }}</strong></span>
      <span>Ряды: <strong class="tabular-nums">{{ snap.lines }}</strong> · Уровень {{ snap.level }}</span>
      <span>Осталось: <strong class="tabular-nums">{{ left }} с</strong></span>
    </div>

    <!-- Стакан целиком на экране: ширина ограничена и высотой окна (поле 1:2). -->
    <div class="relative mx-auto w-full max-w-[min(19rem,calc((100svh_-_24rem)*0.5))] min-w-52">
      <div
        class="border-ink/10 grid grid-cols-10 grid-rows-20 gap-px rounded-2xl border bg-[#ecece7] p-1.5"
        :style="{ aspectRatio: '1 / 2' }"
        role="img"
        aria-label="Стакан тетриса: фигуры в цветах Школы"
      >
        <span
          v-for="(cell, index) in cells"
          :key="index"
          class="rounded-[2px] bg-white/70"
          :style="cellStyle(cell)"
        />
      </div>

      <div
        v-if="phase !== 'playing'"
        class="bg-paper/85 absolute inset-0 grid place-items-center rounded-2xl p-6 text-center backdrop-blur-sm"
      >
        <div class="flex flex-col items-center gap-4">
          <p class="font-display text-2xl">{{ phase === "paused" ? "Пауза" : "Тетрис!" }}</p>
          <p class="text-ink-soft max-w-[26ch]">
            Стрелки двигают, вверх — поворот, пробел — сбросить. {{ TETRIS_SECONDS }}&nbsp;секунд.
          </p>
          <ul class="text-ink-soft flex gap-3 text-sm">
            <li>Ряд — 100</li>
            <li>Два — 300</li>
            <li>Три — 500</li>
            <li>Четыре — 800</li>
          </ul>
          <div class="w-48">
            <UiButton @click="play">
              {{ phase === "paused" ? "Продолжить" : "Начать" }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>

    <div class="mx-auto grid w-full max-w-[19rem] grid-cols-5 gap-2" role="group" aria-label="Кнопки управления">
      <UiButton variant="ghost" aria-label="Влево" @click="snap = tryMove(snap, -1, 0)">←</UiButton>
      <UiButton variant="ghost" aria-label="Вправо" @click="snap = tryMove(snap, 1, 0)">→</UiButton>
      <UiButton variant="ghost" aria-label="Повернуть" @click="snap = tryRotate(snap, 1)">⟳</UiButton>
      <UiButton
        variant="ghost"
        aria-label="Вниз быстрее"
        @pointerdown="soft = true"
        @pointerup="soft = false"
        @pointerleave="soft = false"
        @pointercancel="soft = false"
      >
        ↓
      </UiButton>
      <UiButton variant="ghost" aria-label="Сбросить вниз" @click="drop">⤓</UiButton>
    </div>
  </div>
</template>
