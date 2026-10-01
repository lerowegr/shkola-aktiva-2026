<script setup lang="ts">
import { seeded } from "~/games/rng";
import { isSolved, shuffleBoard, slide, slideByKey, type Direction } from "~/games/slide";
import { clock } from "~~/lib/games/rules";

/**
 * «Пятнашки» 3×3 из стикера-логотипа. Касание по плитке рядом с пустым
 * местом сдвигает её, стрелки на клавиатуре — тоже. Номера в углу —
 * подсказка: края стикера почти одинаковые.
 */
const emit = defineEmits<{ finished: [result: { score: number; moves: number; durationMs: number }] }>();

const N = 3;
const IMAGE = "/brand/logo-sticker.webp";
const board = ref<number[]>(shuffleBoard(N, seeded(Date.now())));
const moves = ref(0);
const done = ref(false);
const stopwatch = useStopwatch();

function apply(next: number[] | null) {
  if (!next || done.value) return;
  stopwatch.start();
  board.value = next;
  moves.value++;
  haptic("tap");
  if (isSolved(next)) {
    done.value = true;
    haptic("success");
    const durationMs = stopwatch.stop();
    emit("finished", { score: durationMs, moves: moves.value, durationMs });
  }
}

const KEYS: Record<string, Direction> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
function onKey(event: KeyboardEvent) {
  const direction = KEYS[event.key];
  if (!direction) return;
  event.preventDefault();
  apply(slideByKey(board.value, N, direction));
}

// Плитка t на своём месте стоит в позиции t-1: оттуда и кусок картинки.
function piece(tile: number) {
  const home = tile - 1;
  const row = Math.floor(home / N);
  const col = home % N;
  return {
    backgroundImage: `url(${IMAGE})`,
    backgroundSize: `${N * 100}% ${N * 100}%`,
    backgroundPosition: `${(col / (N - 1)) * 100}% ${(row / (N - 1)) * 100}%`,
  };
}

function place(tile: number) {
  const index = board.value.indexOf(tile);
  return { transform: `translate(${(index % N) * 100}%, ${Math.floor(index / N) * 100}%)` };
}

const TILES = Array.from({ length: N * N - 1 }, (_, i) => i + 1);
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between gap-3 text-sm">
      <span>Ходов: <strong class="tabular-nums">{{ moves }}</strong></span>
      <span class="tabular-nums">{{ clock(stopwatch.elapsed.value) }}</span>
      <span class="flex items-center gap-2 text-ink-soft">
        Цель
        <img :src="IMAGE" alt="Собранный стикер-логотип" class="size-10 rounded-full">
      </span>
    </div>

    <div
      class="board bg-brand-yellow-soft border-ink/10 focus-visible:ring-accent relative mx-auto aspect-square w-full max-w-sm rounded-3xl border p-1.5 outline-none focus-visible:ring-4"
      tabindex="0"
      role="group"
      aria-label="Поле пятнашек: стрелки двигают плитки"
      @keydown="onKey"
    >
      <div class="relative size-full">
        <button
          v-for="tile in TILES"
          :key="tile"
          type="button"
          class="tile absolute top-0 left-0 size-1/3 p-1"
          :style="place(tile)"
          :aria-label="`Плитка ${tile}`"
          @click="apply(slide(board, N, board.indexOf(tile)))"
        >
          <span class="border-ink/10 relative block size-full rounded-xl border bg-white/40" :style="piece(tile)">
            <span v-if="!done" class="bg-ink/70 text-paper absolute top-1 left-1 grid size-5 place-items-center rounded-md text-[11px] font-semibold">
              {{ tile }}
            </span>
          </span>
        </button>
        <span
          v-if="done"
          class="last absolute top-0 left-0 size-1/3 p-1"
          :style="{ transform: `translate(${(N - 1) * 100}%, ${(N - 1) * 100}%)` }"
        >
          <span class="border-ink/10 block size-full rounded-xl border" :style="piece(N * N)" />
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .tile {
    transition: transform 0.16s ease-out;
  }
  .last {
    animation: appear 0.5s ease-out;
  }
}

@keyframes appear {
  from {
    opacity: 0;
    scale: 0.8;
  }
}
</style>
