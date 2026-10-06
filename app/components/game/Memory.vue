<script setup lang="ts">
import { createMemory, flip, isOpen, memoryDone, settle, type MemoryState } from "~/games/memory";
import { seeded } from "~/games/rng";
import { clock } from "~~/lib/games/rules";

/**
 * «Пары»: 16 карточек, 8 маскотов. Ход — открыть вторую карточку.
 * Несовпавшая пара закрывается сама через секунду или от следующего нажатия.
 * seed — расклад (задание дня фиксирует его датой).
 */
const emit = defineEmits<{ finished: [result: { score: number; moves: number; durationMs: number }] }>();
const props = withDefaults(defineProps<{ seed?: number }>(), { seed: () => Date.now() });

const FACES = [
  { face: "green", tone: "bg-brand-green-soft", name: "зелёный маскот" },
  { face: "orange", tone: "bg-brand-orange-soft", name: "оранжевый маскот" },
  { face: "purple", tone: "bg-brand-purple-soft", name: "фиолетовый маскот" },
  { face: "yellow-b", tone: "bg-brand-yellow-soft", name: "жёлтый маскот" },
  { face: "blue-a", tone: "bg-brand-blue-soft", name: "синий маскот" },
  { face: "cyan", tone: "bg-[#c9f3fa]", name: "голубой маскот" },
  { face: "black-a", tone: "bg-line", name: "чёрный маскот" },
  { face: "orange-angry", tone: "bg-brand-red-soft", name: "сердитый маскот" },
];
const look = Object.fromEntries(FACES.map((item) => [item.face, item]));

const state = ref<MemoryState>(createMemory(FACES.map((item) => item.face), seeded(props.seed)));
const stopwatch = useStopwatch();
let settleTimer: ReturnType<typeof setTimeout> | null = null;

function tap(index: number) {
  if (memoryDone(state.value)) return;
  stopwatch.start();
  const result = flip(state.value, index);
  if (result.event === "ignored") return;
  state.value = result.state;
  if (settleTimer) clearTimeout(settleTimer);

  if (result.event === "match") {
    haptic("tap");
    if (memoryDone(state.value)) {
      haptic("success");
      const durationMs = stopwatch.stop();
      emit("finished", { score: state.value.moves, moves: state.value.moves, durationMs });
    }
  } else if (result.event === "miss") {
    settleTimer = setTimeout(() => (state.value = settle(state.value)), 1000);
  }
}

onBeforeUnmount(() => {
  if (settleTimer) clearTimeout(settleTimer);
});

function label(index: number): string {
  const card = state.value.cards[index]!;
  return isOpen(state.value, index) ? `Карточка ${index + 1}: ${look[card.face]!.name}` : `Карточка ${index + 1}, закрыта`;
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between text-sm">
      <span>Ходов: <strong class="tabular-nums">{{ state.moves }}</strong></span>
      <span>Пар: <strong class="tabular-nums">{{ state.pairs }} из {{ FACES.length }}</strong></span>
      <span class="tabular-nums">{{ clock(stopwatch.elapsed.value) }}</span>
    </div>

    <div class="grid grid-cols-4 gap-2 sm:gap-3">
      <button
        v-for="(card, index) in state.cards"
        :key="card.id"
        type="button"
        class="card aspect-square [perspective:600px]"
        :class="{ open: isOpen(state, index), matched: card.matched }"
        :aria-label="label(index)"
        :aria-pressed="isOpen(state, index)"
        @click="tap(index)"
      >
        <span class="inner relative block size-full">
          <span class="side back border-ink/10 absolute inset-0 overflow-hidden rounded-2xl border">
            <img src="/brand/textures/glitch.webp" alt="" class="size-full object-cover">
          </span>
          <span
            class="side face border-ink/10 absolute inset-0 grid place-items-center rounded-2xl border"
            :class="look[card.face]!.tone"
          >
            <img :src="`/brand/mascots/${card.face}.webp`" alt="" class="w-4/5" draggable="false">
          </span>
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.inner {
  transform-style: preserve-3d;
}
.side {
  backface-visibility: hidden;
}
.face {
  transform: rotateY(180deg);
}
.open .inner {
  transform: rotateY(180deg);
}

@media (prefers-reduced-motion: no-preference) {
  .inner {
    transition: transform 0.35s cubic-bezier(0.3, 0.7, 0.4, 1);
  }
  .matched .face {
    animation: pop 0.4s ease-out;
  }
}

@keyframes pop {
  50% {
    transform: rotateY(180deg) scale(1.08);
  }
}
</style>
