<script setup lang="ts">
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-vue-next";

/**
 * Сценарий собеседования: блоки и вопросы из таблицы. Вопрос с заметками
 * мастеров удалить нельзя — кнопки таких строк нет, сервер объяснит.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Сценарий собеса" });

interface Question {
  id: string;
  order: number;
  block: string;
  text: string;
  intro: boolean;
  _count: { notes: number };
}

const { data, refresh } = await useFetch<{ questions: Question[] }>("/api/admin/interview-guide");

const editing = ref<string | null>(null);
const problem = ref<string | null>(null);
const form = reactive({ block: "", text: "", intro: false });

async function post(path: string, body: Record<string, unknown>) {
  problem.value = null;
  const result = await $fetch<{ ok: boolean; message?: string }>(path, { method: "POST", body, ignoreResponseError: true });
  if (!result.ok) problem.value = result.message ?? "Не получилось.";
  await refresh();
}

function edit(item: Question | null) {
  editing.value = item ? item.id : "new";
  form.block = item?.block ?? "";
  form.text = item?.text ?? "";
  form.intro = item?.intro ?? false;
}

async function save(id?: string) {
  await post("/api/admin/interview-guide/save", { id, block: form.block, text: form.text, intro: form.intro });
  if (!problem.value) {
    editing.value = null;
    form.block = "";
    form.text = "";
    form.intro = false;
  }
}

const move = (id: string, dir: "up" | "down") => post("/api/admin/interview-guide/move", { id, dir });
const remove = (id: string) => post("/api/admin/interview-guide/delete", { id });
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
    <StaffAdminNav />
    <div class="flex items-center justify-between">
      <h1 class="font-display text-2xl">Сценарий собеса</h1>
      <div class="shrink-0">
        <UiButton @click="edit(null)"><Plus class="size-4" aria-hidden="true" /> Вопрос</UiButton>
      </div>
    </div>
    <p class="text-ink-soft text-sm">Блоки и вопросы из таблицы «Портрет участника». Вводная читается без ячеек, остальное — с комментариями мастеров.</p>
    <UiNotice v-if="problem" :message="problem" />

    <ul class="flex flex-col gap-2">
      <li
        v-for="(question, index) in data?.questions ?? []"
        :key="question.id"
        class="bg-card border-line flex items-center gap-2 rounded-2xl border p-3"
      >
        <span class="text-ink-soft w-6 shrink-0 text-sm tabular-nums">{{ index + 1 }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">{{ question.block }}<template v-if="question.intro"> · вводная</template></span>
          <span class="text-ink-soft block truncate text-sm">{{ question.text }}</span>
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
        <button
          v-if="question._count.notes === 0"
          type="button"
          class="rounded-lg p-2 hover:bg-line"
          aria-label="Удалить"
          @click="remove(question.id)"
        >
          <Trash2 class="size-4" aria-hidden="true" />
        </button>
      </li>
    </ul>

    <section v-if="editing" class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
      <h2 class="font-display text-lg">{{ editing === "new" ? "Новый вопрос" : "Править вопрос" }}</h2>
      <UiInput v-model="form.block" label="Блок" />
      <UiTextarea v-model="form.text" label="Текст вопроса" :rows="4" />
      <UiCheckbox v-model="form.intro">Вводная (читается без ячеек)</UiCheckbox>
      <div class="flex gap-2">
        <UiButton @click="save(editing === 'new' ? undefined : editing)">Сохранить</UiButton>
        <UiButton variant="ghost" @click="editing = null">Отмена</UiButton>
      </div>
    </section>
  </main>
</template>
