<script setup lang="ts">
import { ArrowLeft, ArrowRight, Check, Send } from "lucide-vue-next";

import type { CurrentUser } from "~~/lib/auth/actor";
import { testNextAction } from "~~/lib/auth/miniapp-entry";
import type { ActionResult } from "~/composables/useAction";

/**
 * «Тест про ША»: вопросы по одному, варианты перемешаны, «Назад» меняет
 * ответ. Счёт считает сервер; в конце — только число баллов, правильные
 * ответы не показываем. Попытка одна — пройденный тест показывает итог.
 *
 * Рисуется внутри <ClientOnly>: варианты тасуются в браузере.
 */
interface TestData {
  done: { score: number; total: number; completedAt: string; fromBot: boolean } | null;
  questions: { id: string; text: string; options: string[] }[];
}

const { data, refresh, pending, error } = useFetch<TestData>("/api/cabinet/test");
const user = useState<CurrentUser | null>("session", () => null);
const nextAction = computed(() => testNextAction(user.value));

const phase = ref<"intro" | "question" | "result">("intro");
const index = ref(0);
/** Выбранный вариант — индекс в исходном порядке сервера. */
const chosen = ref<Record<string, number>>({});
const spent = ref<Record<string, number>>({});
let openedAt = 0;

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

// Порядок вариантов тасуется один раз на вопрос — «Назад» его не меняет.
const order = computed(() =>
  Object.fromEntries((data.value?.questions ?? []).map((question) => [question.id, shuffle(question.options.map((_, i) => i))])),
);
const questions = computed(() => data.value?.questions ?? []);
const current = computed(() => questions.value[index.value] ?? null);
const last = computed(() => index.value === questions.value.length - 1);

function open(at: number) {
  // Время на вопрос копится: вернулись назад — досчитываем к прежнему.
  if (current.value && openedAt) {
    spent.value[current.value.id] = (spent.value[current.value.id] ?? 0) + (performance.now() - openedAt);
  }
  index.value = at;
  openedAt = performance.now();
}

function start() {
  phase.value = "question";
  index.value = 0;
  openedAt = performance.now();
}

function pick(option: number) {
  if (!current.value) return;
  chosen.value[current.value.id] = option;
}

const sending = ref(false);
const problem = ref<string | null>(null);
const result = ref<{ score: number; total: number } | null>(null);

async function finish() {
  open(index.value);
  sending.value = true;
  problem.value = null;
  try {
    const reply = await $fetch<ActionResult>("/api/cabinet/test/submit", {
      method: "POST",
      body: {
        answers: questions.value.map((question) => ({
          questionId: question.id,
          chosen: chosen.value[question.id]!,
          ms: Math.round(spent.value[question.id] ?? 0),
        })),
      },
      ignoreResponseError: true,
    }).catch((): ActionResult => ({ ok: false, message: "Нет связи с сайтом. Проверьте интернет и нажмите ещё раз." }));
    if (reply.ok) {
      result.value = { score: reply.score as number, total: reply.total as number };
      phase.value = "result";
    } else {
      problem.value = reply.message ?? "Не получилось сохранить. Попробуйте ещё раз.";
      // Уже прошёл в другой вкладке — покажем итог оттуда.
      await refresh();
    }
  } finally {
    sending.value = false;
  }
}

const shown = computed(() => result.value ?? data.value?.done ?? null);

function word(score: number) {
  const tail = score % 100;
  if (tail >= 11 && tail <= 14) return "баллов";
  if (score % 10 === 1) return "балл";
  if ([2, 3, 4].includes(score % 10)) return "балла";
  return "баллов";
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="pending && !data" class="bg-line/60 h-56 animate-pulse rounded-3xl" aria-hidden="true" />

    <div v-else-if="error && !data" class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
      <UiNotice message="Не получилось загрузить тест. Проверьте интернет и попробуйте ещё раз." />
      <UiButton :pending="pending" @click="refresh()">Попробовать ещё раз</UiButton>
    </div>

    <!-- Итог: пройден сейчас или раньше -->
    <section
      v-else-if="shown && (phase === 'result' || data?.done)"
      class="bg-card border-line flex flex-col items-center gap-4 rounded-3xl border p-6 text-center"
      aria-live="polite"
    >
      <img src="/brand/mascots/yellow-b.webp" alt="" class="w-24">
      <p class="text-ink-soft text-sm font-semibold tracking-wide uppercase">Твой результат</p>
      <p class="font-display text-5xl">{{ shown.score }} <span class="text-ink-soft text-2xl">из {{ shown.total }}</span></p>
      <p class="text-lg font-semibold">{{ shown.score }} {{ word(shown.score) }}</p>
      <p class="text-ink-soft max-w-[34ch] text-sm">
        Правильные ответы не показываем. Попытка одна — засчитан этот результат.
        <template v-if="data?.done?.fromBot"> Тест вы проходили в Telegram-боте.</template>
      </p>
      <div class="bg-paper flex w-full flex-col gap-3 rounded-2xl p-4 text-left">
        <p class="font-semibold">А что дальше?</p>
        <p class="text-ink-soft text-sm">Все даты, подробности и новости отбора — в Telegram-канале и ВК Школы Актива.</p>
        <div class="grid gap-2 sm:grid-cols-2">
          <UiButton variant="telegram" href="https://t.me/schoolofactivity" target="_blank">Наш Telegram</UiButton>
          <UiButton variant="ghost" href="https://vk.ru/schoolofactivity" target="_blank">Наш ВК</UiButton>
        </div>
      </div>
      <div class="flex w-full flex-col gap-2">
        <UiButton :href="nextAction.href">
          {{ nextAction.label }} <ArrowRight class="size-4 shrink-0" aria-hidden="true" />
        </UiButton>
        <NuxtLink v-if="nextAction.href !== '/'" to="/" class="text-ink-soft hover:text-ink inline-flex min-h-11 items-center justify-center text-sm">
          Перейти на сайт ША
        </NuxtLink>
      </div>
    </section>

    <!-- Начало -->
    <section v-else-if="phase === 'intro'" class="bg-card border-line flex flex-col items-center gap-4 rounded-3xl border p-6 text-center">
      <img src="/brand/logo-sticker-short.webp" alt="" class="w-28">
      <p class="font-display text-2xl">Насколько хорошо ты знаешь ША?</p>
      <p class="text-ink-soft max-w-[32ch]">
        {{ questions.length }} вопросов, около двух минут. Правильные ответы не показываем — в конце увидишь только
        количество баллов.
      </p>
      <p class="bg-brand-yellow-soft rounded-2xl px-4 py-2 text-sm">Попытка одна: пройти заново не получится.</p>
      <p v-if="questions.length === 0" class="text-ink-soft text-sm">Вопросов пока нет — организаторы их скоро добавят.</p>
      <div class="w-56">
        <UiButton :disabled="questions.length === 0" @click="start">Пройти тест <ArrowRight class="size-5" aria-hidden="true" /></UiButton>
      </div>
    </section>

    <!-- Вопрос -->
    <section v-else-if="current" class="flex flex-col gap-4" :aria-label="`Вопрос ${index + 1}`">
      <div class="flex flex-col gap-2">
        <div class="text-ink-soft flex justify-between text-sm">
          <span>Вопрос {{ index + 1 }} из {{ questions.length }}</span>
          <span>Выбери один ответ</span>
        </div>
        <div class="bg-card border-line flex gap-1 rounded-full border p-1" aria-hidden="true">
          <span
            v-for="n in questions.length"
            :key="n"
            class="h-1.5 flex-1 rounded-full transition-colors"
            :class="n - 1 <= index ? 'bg-accent' : 'bg-paper'"
          />
        </div>
      </div>

      <h2 class="font-display text-2xl">{{ current.text }}</h2>

      <div role="radiogroup" :aria-label="current.text" class="flex flex-col gap-2">
        <button
          v-for="option in order[current.id]"
          :key="option"
          type="button"
          role="radio"
          :aria-checked="chosen[current.id] === option"
          class="flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-3 text-left font-medium transition"
          :class="chosen[current.id] === option ? 'border-accent bg-accent/10' : 'border-line bg-card hover:border-accent/50'"
          @click="pick(option)"
        >
          <span
            class="grid size-6 shrink-0 place-items-center rounded-full border-2"
            :class="chosen[current.id] === option ? 'border-accent bg-accent text-white' : 'border-line'"
          >
            <Check v-if="chosen[current.id] === option" class="size-3.5" aria-hidden="true" />
          </span>
          {{ current.options[option] }}
        </button>
      </div>

      <UiNotice :message="problem" />

      <div class="flex gap-2">
        <div v-if="index > 0" class="w-36 shrink-0">
          <UiButton variant="ghost" @click="open(index - 1)"><ArrowLeft class="size-5" aria-hidden="true" /> Назад</UiButton>
        </div>
        <UiButton v-if="!last" :disabled="chosen[current.id] === undefined" @click="open(index + 1)">
          Дальше <ArrowRight class="size-5" aria-hidden="true" />
        </UiButton>
        <UiButton v-else :pending="sending" :disabled="chosen[current.id] === undefined" @click="finish">
          <Send class="size-5" aria-hidden="true" /> Узнать результат
        </UiButton>
      </div>
    </section>
  </div>
</template>
