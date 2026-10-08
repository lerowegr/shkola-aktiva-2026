<script setup lang="ts">
import { seeded, type Rng } from "~/games/rng";
import { buildRound, questionScore, QUIZ_SECONDS_PER_QUESTION, type QuizRoundItem } from "~/games/quiz";

/**
 * «Викторина»: десять вопросов на время, 15 секунд на вопрос.
 * Вопросы — встроенный пул (app/games/quiz.ts); pool="local" — с сидом дня,
 * чтобы задание дня было одинаковым у всех.
 */
const props = withDefaults(defineProps<{ seed?: number; pool?: "server" | "local" }>(), {
  seed: () => Date.now(),
  pool: "server",
});
const emit = defineEmits<{ finished: [result: { score: number; durationMs: number }] }>();

const rng: Rng = seeded(props.seed);
// Только встроенный пул: вопросы из админки — это «Тест про ША», и их
// верные ответы в браузер не отдаём.
const round = computed<QuizRoundItem[] | null>(() => buildRound(props.pool === "local" ? seeded(props.seed) : rng));

const index = ref(0);
const score = ref(0);
const picked = ref<number | null>(null);
const left = ref(QUIZ_SECONDS_PER_QUESTION);
const startedAt = ref(0);
/** Миллисекунд на паузах — вычитаем из итога, иначе пауза роняет правдоподобие. */
const pausedTotal = ref(0);
let pauseStart = 0;
const phase = ref<"ready" | "playing" | "over">("ready");

let frame = 0;
let deadline = 0;
/** Секунд осталось на вопрос после паузы. */
let resumeLeft = QUIZ_SECONDS_PER_QUESTION;

const current = computed(() => round.value?.[index.value] ?? null);

function stopLoop() {
  cancelAnimationFrame(frame);
}

function loop(moment: number) {
  const rest = Math.max(0, (deadline - moment) / 1000);
  left.value = rest;
  if (rest <= 0) {
    next(false);
    return;
  }
  frame = requestAnimationFrame(loop);
}

function play() {
  if (!round.value || phase.value !== "ready") return;
  phase.value = "playing";
  startedAt.value = performance.now();
  deadline = startedAt.value + QUIZ_SECONDS_PER_QUESTION * 1000;
  frame = requestAnimationFrame(loop);
}

function pause() {
  if (phase.value !== "playing") return;
  stopLoop();
  pauseStart = performance.now();
  // Возврат — как старт вопроса заново с остатком времени.
  resumeLeft = Math.max(0, (deadline - pauseStart) / 1000);
  phase.value = "ready";
}

function resume() {
  if (phase.value !== "ready" || !round.value) return;
  pausedTotal.value += performance.now() - pauseStart;
  phase.value = "playing";
  deadline = performance.now() + resumeLeft * 1000;
  frame = requestAnimationFrame(loop);
}

function next(hit: boolean, secondsLeft = 0) {
  if (typeof document !== "undefined" && document.hidden) {
    // Таймаут сработал, пока вкладка была спрятана: тот же вопрос на паузе.
    picked.value = null;
    resumeLeft = left.value;
    phase.value = "ready";
    return;
  }
  if (hit) {
    score.value += questionScore(secondsLeft);
    haptic("success");
  } else if (picked.value !== null || secondsLeft === 0) {
    haptic("error");
  }
  picked.value = null;
  index.value++;
  if (round.value && index.value >= round.value.length) {
    stopLoop();
    phase.value = "over";
    emit("finished", { score: score.value, durationMs: Math.round(performance.now() - startedAt.value - pausedTotal.value) });
    return;
  }
  resumeLeft = QUIZ_SECONDS_PER_QUESTION;
  left.value = QUIZ_SECONDS_PER_QUESTION;
  deadline = performance.now() + QUIZ_SECONDS_PER_QUESTION * 1000;
  frame = requestAnimationFrame(loop);
}

function answer(option: number) {
  if (phase.value !== "playing" || picked.value !== null || !current.value) return;
  picked.value = option;
  const hit = option === current.value.correct;
  stopLoop();
  setTimeout(() => next(hit, left.value), 450);
}

const onVisibility = () => document.hidden && pause();

onMounted(() => {
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("blur", pause);
});

onBeforeUnmount(() => {
  stopLoop();
  document.removeEventListener("visibilitychange", onVisibility);
  window.removeEventListener("blur", pause);
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="round" class="flex items-center justify-between text-sm">
      <span>Очки: <strong class="tabular-nums">{{ score }}</strong></span>
      <span>Вопрос: <strong class="tabular-nums">{{ Math.min(index + 1, round.length) }} из {{ round.length }}</strong></span>
      <span>Осталось: <strong class="tabular-nums">{{ Math.ceil(left) }} с</strong></span>
    </div>
    <div v-if="round" class="bg-line h-2 overflow-hidden rounded-full" aria-hidden="true">
      <div class="bg-accent h-full rounded-full transition-[width]" :style="{ width: `${(left / QUIZ_SECONDS_PER_QUESTION) * 100}%` }" />
    </div>

    <div v-if="!round" class="bg-line/60 h-48 animate-pulse rounded-3xl" aria-hidden="true" />

    <template v-else-if="phase === 'ready' && index === 0 && score === 0">
      <div class="bg-card border-line flex flex-col items-center gap-4 rounded-3xl border p-6 text-center">
        <p class="font-display text-2xl">Викторина!</p>
        <p class="text-ink-soft max-w-[30ch]">Десять вопросов о Школе Актива, {{ QUIZ_SECONDS_PER_QUESTION }} секунд на вопрос. Быстрый верный ответ дороже.</p>
        <div class="w-48">
          <UiButton @click="play">Начать</UiButton>
        </div>
      </div>
    </template>

    <template v-else-if="current && phase !== 'over'">
      <p class="font-display text-xl">{{ current.text }}</p>
      <div class="grid grid-cols-1 gap-2">
        <button
          v-for="(option, optionIndex) in current.options"
          :key="option"
          type="button"
          :disabled="picked !== null"
          class="rounded-2xl border p-3 text-left font-medium transition"
          :class="[
            picked === null ? 'border-line bg-card hover:border-ink-soft' : 'border-line bg-card',
            picked !== null && optionIndex === current.correct ? 'border-ok bg-ok/10' : '',
            picked === optionIndex && optionIndex !== current.correct ? 'border-danger bg-danger/10' : '',
          ]"
          @click="answer(optionIndex)"
        >
          {{ option }}
        </button>
      </div>
      <UiButton v-if="phase === 'ready'" variant="ghost" @click="resume">Продолжить</UiButton>
    </template>
  </div>
</template>
