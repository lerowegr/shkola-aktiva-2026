<script setup lang="ts">
import { ArrowDown, ArrowUp, Download, Pencil, Plus, Trash2 } from "lucide-vue-next";

/**
 * «Тест про ША»: вопросы теста и его итоги. Тест — все активные вопросы
 * по порядку; попытка одна, счёт считает сервер. Выключенные вопросы в тест
 * не попадают, удалённые — не возвращаются. Прошлые результаты хранят
 * ответы снимком, поэтому правка вопроса их не портит.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Тест про ША" });

interface Stats {
  participants: number;
  average: number | null;
  distribution: { score: number; count: number }[];
  questions: { question: string; answered: number; correctShare: number; averageMs: number }[];
  bySource: { site: number; bot: number };
}
const { data: results } = await useFetch<{ stats: Stats; canExport: boolean }>("/api/admin/quiz/results");
const stats = computed(() => results.value?.stats ?? null);
const percent = (share: number) => `${Math.round(share * 100)}%`;
const seconds = (ms: number) => `${(ms / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с`;
// От сложного к простому: на что стоит посмотреть в первую очередь.
const hardest = computed(() =>
  [...(stats.value?.questions ?? [])]
    .sort((a, b) => a.correctShare - b.correctShare)
    .map((row) => ({ label: row.question, value: Math.round(row.correctShare * 100), share: percent(row.correctShare), hint: `ответили ${row.answered} · в среднем ${seconds(row.averageMs)}` })),
);

interface Question {
  id: string;
  order: number;
  text: string;
  options: string[];
  correct: number;
  isActive: boolean;
}

const { data, refresh } = await useFetch<{ questions: Question[] }>("/api/admin/quiz");

const editing = ref<string | null>(null);
const problem = ref<string | null>(null);
const form = reactive({ text: "", options: "", correct: 0, isActive: true });

async function post(path: string, body: Record<string, unknown>) {
  problem.value = null;
  const result = await $fetch<{ ok: boolean; message?: string }>(path, { method: "POST", body, ignoreResponseError: true });
  if (!result.ok) problem.value = result.message ?? "Не получилось.";
  await refresh();
}

function edit(item: Question | null) {
  editing.value = item ? item.id : "new";
  form.text = item?.text ?? "";
  form.options = item ? item.options.join("\n") : "";
  form.correct = item?.correct ?? 0;
  form.isActive = item?.isActive ?? true;
}

async function save(id?: string) {
  await post("/api/admin/quiz/save", {
    id,
    text: form.text,
    options: form.options.split("\n"),
    correct: form.correct,
    isActive: form.isActive,
  });
  if (!problem.value) {
    editing.value = null;
    form.text = "";
    form.options = "";
    form.correct = 0;
    form.isActive = true;
  }
}

const move = (id: string, dir: "up" | "down") => post("/api/admin/quiz/move", { id, dir });
const remove = (id: string) => post("/api/admin/quiz/delete", { id });
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
    <StaffAdminNav />
    <div class="flex items-center justify-between">
      <h1 class="font-display text-2xl">Тест про ША</h1>
      <div class="shrink-0">
        <UiButton @click="edit(null)"><Plus class="size-4" aria-hidden="true" /> Вопрос</UiButton>
      </div>
    </div>
    <p class="text-ink-soft text-sm">
      Тест — все активные вопросы по порядку, варианты кандидату перемешиваются. Попытка одна, в конце кандидат видит
      только число баллов; верные ответы не уходят в браузер. На отбор тест не влияет. Если кандидаты уже проходят тест,
      меняйте вопросы осторожно: те, кто прошёл раньше, отвечали на старые.
    </p>

    <section v-if="stats" class="flex flex-col gap-4">
      <div class="flex items-center justify-between gap-3">
        <h2 class="font-display text-xl">Итоги</h2>
        <div v-if="results?.canExport && stats.participants" class="shrink-0">
          <UiButton variant="ghost" href="/api/admin/quiz/results.csv"><Download class="size-4" aria-hidden="true" /> CSV</UiButton>
        </div>
      </div>
      <div class="grid gap-3 sm:grid-cols-3">
        <DashStat label="Прошли" :value="String(stats.participants)" :note="`на сайте ${stats.bySource.site} · в боте ${stats.bySource.bot}`" />
        <DashStat label="Средний балл" :value="stats.average === null ? '—' : stats.average.toLocaleString('ru-RU')" />
        <DashStat label="Ответили на всё верно" :value="String(stats.distribution.at(-1)?.count ?? 0)" />
      </div>
      <template v-if="stats.participants">
        <DashCard title="Баллы" hint="Сколько человек набрали каждый балл.">
          <DashHistogram :counts="stats.distribution.map((row) => row.count)" :mean="stats.average" caption="Распределение баллов теста про ША" />
        </DashCard>
        <DashCard title="Вопросы — от сложного к простому" hint="Доля верных ответов и среднее время на вопрос.">
          <ul class="flex flex-col gap-3">
            <li v-for="row in hardest" :key="row.label" class="flex flex-col gap-1.5">
              <div class="flex items-baseline justify-between gap-3 text-sm">
                <span class="min-w-0">{{ row.label }}</span>
                <span class="shrink-0 tabular-nums"><strong>{{ row.share }}</strong> <span class="text-ink-soft">верно</span></span>
              </div>
              <div class="bg-paper h-3 overflow-hidden rounded-r-[4px]" aria-hidden="true">
                <div class="bg-brand-blue h-full rounded-r-[4px]" :style="{ width: `${row.value}%` }" />
              </div>
              <p class="text-ink-soft text-xs">{{ row.hint }}</p>
            </li>
          </ul>
        </DashCard>
      </template>
      <p v-else class="text-ink-soft text-sm">Тест ещё никто не прошёл.</p>
    </section>

    <h2 class="font-display text-xl">Вопросы</h2>
    <UiNotice v-if="problem" :message="problem" />

    <ul class="flex flex-col gap-2">
      <li
        v-for="(question, index) in data?.questions ?? []"
        :key="question.id"
        class="bg-card border-line flex items-center gap-2 rounded-2xl border p-3"
        :class="{ 'opacity-60': !question.isActive }"
      >
        <span class="text-ink-soft w-6 shrink-0 text-sm tabular-nums">{{ index + 1 }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">{{ question.text }}</span>
          <span class="text-ink-soft block truncate text-sm">Верный: {{ question.options[question.correct] }} · всего {{ question.options.length }}</span>
        </span>
        <button type="button" class="rounded-lg p-2 hover:bg-line" aria-label="Выше" :disabled="index === 0" @click="move(question.id, 'up')">
          <ArrowUp class="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="rounded-lg p-2 hover:bg-line"
          aria-label="Ниже"
          :disabled="index === (data?.questions.length ?? 0) - 1"
          @click="move(question.id, 'down')"
        >
          <ArrowDown class="size-4" aria-hidden="true" />
        </button>
        <button type="button" class="rounded-lg p-2 hover:bg-line" aria-label="Править" @click="edit(question)">
          <Pencil class="size-4" aria-hidden="true" />
        </button>
        <button type="button" class="rounded-lg p-2 hover:bg-line" aria-label="Удалить" @click="remove(question.id)">
          <Trash2 class="size-4" aria-hidden="true" />
        </button>
      </li>
    </ul>

    <section v-if="editing" class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
      <h2 class="font-display text-lg">{{ editing === "new" ? "Новый вопрос" : "Править вопрос" }}</h2>
      <UiInput v-model="form.text" label="Вопрос" />
      <UiTextarea v-model="form.options" label="Варианты — каждый с новой строки" :rows="5" />
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-ink-soft">Верный вариант</span>
        <select v-model.number="form.correct" class="border-line bg-paper min-h-11 rounded-xl border px-3">
          <option v-for="(option, i) in form.options.split('\n').filter((line) => line.trim())" :key="i" :value="i">{{ option }}</option>
        </select>
      </label>
      <UiCheckbox v-model="form.isActive">Активен (попадает в тест)</UiCheckbox>
      <div class="flex gap-2">
        <UiButton @click="save(editing === 'new' ? undefined : editing)">Сохранить</UiButton>
        <UiButton variant="ghost" @click="editing = null">Отмена</UiButton>
      </div>
    </section>
  </main>
</template>
