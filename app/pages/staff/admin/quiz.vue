<script setup lang="ts">
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-vue-next";

/**
 * Викторина: вопросы и ответы для игры. Верный вариант помечен галочкой.
 * Выключенные вопросы в игру не попадают, удалённые — не возвращаются.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Викторина" });

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
    <div class="flex items-center justify-between">
      <h1 class="font-display text-2xl">Викторина</h1>
      <div class="shrink-0">
        <UiButton @click="edit(null)"><Plus class="size-4" aria-hidden="true" /> Вопрос</UiButton>
      </div>
    </div>
    <p class="text-ink-soft text-sm">Десять случайных активных вопросов попадают в партию. Верный вариант игроки не видят.</p>
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
      <UiTextarea v-model="form.options" label="Варианты — каждый с новой строки, первый верный по умолчанию" :rows="5" />
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-ink-soft">Верный вариант (номер с нуля: первый — 0)</span>
        <input v-model.number="form.correct" type="number" min="0" max="5" class="border-line bg-paper w-24 rounded-xl border p-2">
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input v-model="form.isActive" type="checkbox"> Активен (попадает в игру)
      </label>
      <div class="flex gap-2">
        <UiButton @click="save(editing === 'new' ? undefined : editing)">Сохранить</UiButton>
        <UiButton variant="ghost" @click="editing = null">Отмена</UiButton>
      </div>
    </section>
  </main>
</template>
