<script setup lang="ts">
import { createMerge, MERGE_MS, MERGE_SIZE, move, stageImage, tickTime, valueOf, type MergeDir, type MergeState } from "~/games/merge";
import { seeded } from "~/games/rng";
import { MERGE_SECONDS } from "~~/lib/games/rules";

/**
 * «2048 с маскотами»: сливайте одинаковых, растите до логотипа.
 * Стрелки и свайпы. Лимит — пять минут или тупик.
 */
const props = withDefaults(defineProps<{ seed?: number }>(), { seed: () => Date.now() });
const emit = defineEmits<{ finished: [result: { score: number; durationMs: number }] }>();

const snap = ref<MergeState>(createMerge(seeded(props.seed)));
const rng = seeded(props.seed ^ 0x51ab3f17);
const gained = ref(0);
/** Время идёт с первого хода, а не с открытия экрана — как секундомер в «Парах». */
const started = ref(false);
let gainedTimer: ReturnType<typeof setTimeout> | null = null;

let frame = 0;
let last = 0;
let finished = false;

const won = computed(() => snap.value.board.some((tile) => tile && tile.exp >= 11));
const left = computed(() => Math.ceil((MERGE_MS - snap.value.timeMs) / 1000));

function place(index: number) {
  return {
    transform: `translate(${(index % MERGE_SIZE) * 100}%, ${Math.floor(index / MERGE_SIZE) * 100}%)`,
  };
}

function finish() {
  if (finished) return;
  finished = true;
  cancelAnimationFrame(frame);
  haptic(snap.value.score > 0 ? "success" : "error");
  emit("finished", { score: snap.value.score, durationMs: snap.value.timeMs });
}

function tick(moment: number) {
  const dt = Math.min(moment - last, 100);
  last = moment;
  if (started.value) {
    snap.value = tickTime(snap.value, dt);
    if (snap.value.over) {
      finish();
      return;
    }
  }
  frame = requestAnimationFrame(tick);
}

function shift(dir: MergeDir) {
  if (finished || snap.value.over) return;
  const result = move(snap.value, dir, rng);
  if (!result.moved) return;
  started.value = true;
  snap.value = tickTime(result.state, 0);
  haptic(result.gained > 0 ? "success" : "tap");
  if (result.gained > 0) {
    gained.value = result.gained;
    if (gainedTimer) clearTimeout(gainedTimer);
    gainedTimer = setTimeout(() => (gained.value = 0), 900);
  }
  if (snap.value.over) finish();
}

const KEYS: Record<string, MergeDir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };
function onKey(event: KeyboardEvent) {
  const dir = KEYS[event.key];
  if (!dir) return;
  event.preventDefault();
  shift(dir);
}

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
  shift(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
}

onMounted(() => {
  last = performance.now();
  frame = requestAnimationFrame(tick);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  if (gainedTimer) clearTimeout(gainedTimer);
});

const TILES = computed(() =>
  snap.value.board.flatMap((tile, index) => (tile ? [{ ...tile, index }] : [])),
);
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between text-sm">
      <span>Очки: <strong class="tabular-nums">{{ snap.score }}</strong></span>
      <span v-if="gained > 0" class="text-ok font-semibold" aria-live="polite">+{{ gained }}</span>
      <span>Осталось: <strong class="tabular-nums">{{ left }} с</strong></span>
    </div>
    <p v-if="won" class="bg-brand-yellow-soft rounded-2xl p-3 text-center text-sm font-semibold">
      Логотип собран! Продолжайте — очки капают дальше.
    </p>

    <div
      class="board bg-brand-yellow-soft border-ink/10 focus-visible:ring-accent relative mx-auto aspect-square w-full max-w-sm touch-none rounded-3xl border p-1.5 outline-none select-none focus-visible:ring-4"
      tabindex="0"
      role="group"
      aria-label="Поле 2048: стрелки и свайпы двигают плитки"
      @keydown="onKey"
      @pointerdown="swipeStart"
      @pointerup="swipeEnd"
    >
      <div class="relative size-full">
        <span v-for="index in MERGE_SIZE * MERGE_SIZE" :key="`cell-${index}`" class="absolute top-0 left-0 size-1/4 p-1" :style="place(index - 1)">
          <span class="bg-ink/5 block size-full rounded-xl" />
        </span>
        <button
          v-for="tile in TILES"
          :key="tile.id"
          type="button"
          class="tile absolute top-0 left-0 size-1/4 p-1"
          :style="place(tile.index)"
          :aria-label="`Плитка ${valueOf(tile)}`"
          tabindex="-1"
        >
          <span class="border-ink/10 relative block size-full overflow-hidden rounded-xl border bg-white">
            <img :src="stageImage(tile.exp)" alt="" class="size-full object-cover" draggable="false">
            <span class="bg-ink/70 text-paper absolute right-1 bottom-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums">
              {{ valueOf(tile) }}
            </span>
          </span>
        </button>
      </div>
    </div>
    <p class="text-ink-soft text-center text-sm">Лимит — {{ Math.round(MERGE_SECONDS / 60) }} минут. Дальше — итог.</p>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .tile {
    transition: transform 0.12s ease-out;
  }
}
</style>
