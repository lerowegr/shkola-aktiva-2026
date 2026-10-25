<script setup lang="ts">
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-vue-next";

/**
 * Задания центра оценки: под каждым на экране подгруппы эксперты пишут
 * комментарий о каждом кандидате. Задание с комментариями удалить нельзя —
 * только выключить: написанное останется в оценке.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Задания ЦО" });

interface Task {
  id: string;
  title: string;
  order: number;
  active: boolean;
}

const { data, refresh } = await useFetch<{ tasks: Task[] }>("/api/admin/assessment-tasks");

const editing = ref<string | null>(null);
const problem = ref<string | null>(null);
const title = ref("");

async function post(path: string, body: Record<string, unknown>) {
  problem.value = null;
  const result = await $fetch<{ ok: boolean; message?: string }>(path, { method: "POST", body, ignoreResponseError: true }).catch(() => ({
    ok: false,
    message: "Нет связи с сайтом. Проверьте интернет.",
  }));
  if (!result.ok) problem.value = result.message ?? "Не получилось.";
  await refresh();
  return result.ok;
}

function edit(task: Task | null) {
  editing.value = task ? task.id : "new";
  title.value = task?.title ?? "";
}

async function save() {
  const id = editing.value === "new" ? undefined : (editing.value ?? undefined);
  if (await post("/api/admin/assessment-tasks/save", { id, title: title.value })) editing.value = null;
}

// Порядок — обменом с соседом: номера у заданий свои, сквозные.
async function move(index: number, dir: -1 | 1) {
  const tasks = data.value?.tasks ?? [];
  const [a, b] = [tasks[index], tasks[index + dir]];
  if (!a || !b) return;
  await post("/api/admin/assessment-tasks/save", { id: a.id, title: a.title, order: b.order === a.order ? a.order + dir : b.order });
  await post("/api/admin/assessment-tasks/save", { id: b.id, title: b.title, order: a.order });
}

const toggle = (task: Task) => post("/api/admin/assessment-tasks/save", { id: task.id, title: task.title, active: !task.active });
const remove = (task: Task) => post("/api/admin/assessment-tasks/delete", { id: task.id });
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
    <StaffAdminNav />
    <div class="flex items-center justify-between gap-3">
      <h1 class="font-display text-2xl">Задания ЦО</h1>
      <div class="shrink-0">
        <UiButton @click="edit(null)"><Plus class="size-4" aria-hidden="true" /> Задание</UiButton>
      </div>
    </div>
    <p class="text-ink-soft text-sm">
      На экране подгруппы под каждым заданием эксперты пишут, как кандидат себя проявил. Выключенное задание пропадает с
      экрана, написанное к нему остаётся в базе.
    </p>
    <UiNotice v-if="problem" :message="problem" />

    <ul class="flex flex-col gap-2">
      <li v-for="(task, index) in data?.tasks ?? []" :key="task.id" class="bg-card border-line flex items-center gap-2 rounded-2xl border p-3">
        <span class="text-ink-soft w-6 shrink-0 text-sm tabular-nums">{{ index + 1 }}</span>
        <span class="min-w-0 flex-1 truncate font-medium" :class="task.active ? '' : 'text-ink-soft line-through'">{{ task.title }}</span>
        <button type="button" class="text-ink-soft hover:bg-line rounded-lg px-2 py-2 text-xs" @click="toggle(task)">
          {{ task.active ? "Выключить" : "Включить" }}
        </button>
        <button type="button" class="hover:bg-line rounded-lg p-2" aria-label="Выше" :disabled="index === 0" @click="move(index, -1)">
          <ArrowUp class="size-4" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="hover:bg-line rounded-lg p-2"
          aria-label="Ниже"
          :disabled="index === (data?.tasks.length ?? 0) - 1"
          @click="move(index, 1)"
        >
          <ArrowDown class="size-4" aria-hidden="true" />
        </button>
        <button type="button" class="hover:bg-line rounded-lg p-2" aria-label="Переименовать" @click="edit(task)">
          <Pencil class="size-4" aria-hidden="true" />
        </button>
        <button type="button" class="hover:bg-line rounded-lg p-2" aria-label="Удалить" @click="remove(task)">
          <Trash2 class="size-4" aria-hidden="true" />
        </button>
      </li>
      <li v-if="data?.tasks.length === 0" class="text-ink-soft text-sm">Заданий нет — добавьте первое.</li>
    </ul>

    <section v-if="editing" class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
      <h2 class="font-display text-lg">{{ editing === "new" ? "Новое задание" : "Переименовать" }}</h2>
      <UiInput v-model="title" label="Название" />
      <div class="flex gap-2">
        <UiButton @click="save">Сохранить</UiButton>
        <UiButton variant="ghost" @click="editing = null">Отмена</UiButton>
      </div>
    </section>
  </main>
</template>
