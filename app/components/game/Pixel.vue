<script setup lang="ts">
import { buildParty, roundScore, STAGE_BLOCKS } from "~/games/pixel";
import { seeded } from "~/games/rng";

/**
 * «Пиксели»: герой Школы из крупных пикселей. Кнопка «Чётче» снижает
 * награду, мимо — минус. Пять загадок, у каждой четыре варианта.
 */
const props = withDefaults(defineProps<{ seed?: number }>(), { seed: () => Date.now() });
const emit = defineEmits<{ finished: [result: { score: number; durationMs: number }] }>();

const party = buildParty(seeded(props.seed));
const round = ref(0);
const stage = ref(0);
const wrong = ref(0);
const pickedWrong = ref<number[]>([]);
const score = ref(0);
const phase = ref<"loading" | "ready" | "playing" | "paused">("loading");

const canvas = ref<HTMLCanvasElement | null>(null);
const images = new Map<string, HTMLImageElement>();
let roundStart = 0;
let totalStart = 0;
let pausedAt = 0;

// После последней загадки раунд выходит за конец — загадки уже нет.
const current = computed(() => party[round.value] ?? null);
const done = computed(() => round.value >= party.length);

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function draw() {
  const element = canvas.value;
  const image = current.value ? images.get(current.value.src) : undefined;
  if (!element || !image) return;
  const context = element.getContext("2d");
  if (!context) return;
  const size = element.width;
  const block = STAGE_BLOCKS[stage.value]!;
  context.imageSmoothingEnabled = false;
  context.fillStyle = "#fdfdfb";
  context.fillRect(0, 0, size, size);

  const scale = Math.max(size / image.width, size / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const dx = (size - width) / 2;
  const dy = (size - height) / 2;

  if (block === 0) {
    context.drawImage(image, dx, dy, width, height);
    return;
  }
  const tiny = Math.max(1, Math.ceil(size / block));
  const off = document.createElement("canvas");
  off.width = tiny;
  off.height = tiny;
  const offContext = off.getContext("2d")!;
  offContext.imageSmoothingEnabled = false;
  // Квадратики исходника в мелкий холст покрытием, потом растягиваем.
  const cover = Math.max(tiny / image.width, tiny / image.height);
  offContext.drawImage(image, (tiny - image.width * cover) / 2, (tiny - image.height * cover) / 2, image.width * cover, image.height * cover);
  context.drawImage(off, 0, 0, size, size);
}

function play() {
  const moment = performance.now();
  if (phase.value === "ready") totalStart = moment;
  else if (phase.value === "paused") {
    const gap = moment - pausedAt;
    totalStart += gap;
    roundStart += gap;
  } else return;
  roundStart = phase.value === "ready" ? moment : roundStart;
  phase.value = "playing";
}

function pause() {
  if (phase.value !== "playing") return;
  pausedAt = performance.now();
  phase.value = "paused";
}

function sharper() {
  if (phase.value !== "playing" || stage.value >= STAGE_BLOCKS.length - 1) return;
  stage.value++;
  draw();
}

function answer(index: number) {
  if (phase.value !== "playing" || done.value) return;
  if (!current.value) return;
  if (index === current.value.correct) {
    score.value += roundScore(stage.value, (performance.now() - roundStart) / 1000, wrong.value);
    haptic("success");
    round.value++;
    if (round.value >= party.length) {
      emit("finished", { score: score.value, durationMs: Math.round(performance.now() - totalStart) });
      return;
    }
    stage.value = 0;
    wrong.value = 0;
    pickedWrong.value = [];
    roundStart = performance.now();
    draw();
  } else if (!pickedWrong.value.includes(index)) {
    pickedWrong.value.push(index);
    wrong.value++;
    haptic("error");
  }
}

const onVisibility = () => document.hidden && pause();

onMounted(async () => {
  await Promise.all(party.map(async (item) => images.set(item.src, await load(item.src).catch(() => undefined as unknown as HTMLImageElement))));
  draw();
  phase.value = "ready";
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", pause);
});

onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", onVisibility);
  window.removeEventListener("blur", pause);
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex items-center justify-between text-sm">
      <span>Очки: <strong class="tabular-nums">{{ score }}</strong></span>
      <span>Загадка: <strong class="tabular-nums">{{ Math.min(round + 1, party.length) }} из {{ party.length }}</strong></span>
    </div>

    <div class="relative mx-auto w-full max-w-sm">
      <canvas
        ref="canvas"
        width="320"
        height="320"
        class="border-ink/10 block aspect-square w-full rounded-3xl border [image-rendering:pixelated]"
        role="img"
        aria-label="Запикселенный герой Школы"
      />
      <div
        v-if="phase !== 'playing'"
        class="bg-paper/85 absolute inset-0 grid place-items-center rounded-3xl p-6 text-center backdrop-blur-sm"
      >
        <div class="flex flex-col items-center gap-4">
          <p class="font-display text-2xl">{{ phase === "paused" ? "Пауза" : phase === "loading" ? "…" : "Пиксели!" }}</p>
          <p class="text-ink-soft max-w-[28ch]">
            Угадайте героя по крупным пикселям. Кнопка «Чётче» проясняет, но снижает награду. Мимо — минус.
          </p>
          <div class="w-48">
            <UiButton :disabled="phase === 'loading'" @click="play">
              {{ phase === "paused" ? "Продолжить" : "Начать" }}
            </UiButton>
          </div>
        </div>
      </div>
    </div>

    <div v-if="current && (phase === 'playing' || phase === 'paused')" class="flex flex-col gap-3">
      <div class="flex items-center justify-between text-sm">
        <span class="text-ink-soft">Чёткость: <strong class="tabular-nums">{{ stage + 1 }} из {{ STAGE_BLOCKS.length }}</strong></span>
        <div class="shrink-0">
          <UiButton variant="ghost" @click="sharper">Чётче</UiButton>
        </div>
      </div>
      <div class="grid grid-cols-1 gap-2">
        <button
          v-for="(option, index) in current.options"
          :key="option"
          type="button"
          :disabled="pickedWrong.includes(index)"
          class="border-line bg-card rounded-2xl border p-3 text-left font-medium transition hover:border-ink-soft disabled:opacity-40"
          @click="answer(index)"
        >
          {{ option }}
        </button>
      </div>
    </div>
  </div>
</template>
