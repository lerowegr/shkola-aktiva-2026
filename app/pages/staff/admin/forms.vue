<script setup lang="ts">
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-vue-next";

/**
 * Анкета и оценка: вопросы анкеты, критерии и маркеры каждого этапа.
 * Удалить то, на что уже отвечали или по чему ставили баллы, нельзя —
 * кнопки таких строк выключены, а сервер объяснит, если всё же попробовать.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Анкета и оценка" });

type Stage = "APPLICATION" | "HOMEWORK" | "INTERVIEW";
interface Editor {
  questions: {
    id: string;
    section: string;
    type: "SHORT_TEXT" | "LONG_TEXT" | "SINGLE_CHOICE" | "MULTI_CHOICE" | "URL";
    label: string;
    help: string | null;
    required: boolean;
    options: string[];
    maxLength: number | null;
    answers: number;
  }[];
  criteria: { id: string; stageKind: Stage; title: string; badge: string | null; maxScore: number; levels: { score: number; text: string }[]; scores: number }[];
  markers: { id: string; stageKind: Stage; title: string; example: string | null; notes: number }[];
}

const { data, refresh } = await useFetch<Editor>("/api/admin/forms");

const TABS = [
  { key: "form", label: "Анкета" },
  { key: "APPLICATION", label: "Оценка анкеты" },
  { key: "HOMEWORK", label: "Оценка ДЗ" },
  { key: "INTERVIEW", label: "Оценка собеседования" },
] as const;
const tab = ref<(typeof TABS)[number]["key"]>("form");
const editing = ref<string | null>(null);
const problem = ref<string | null>(null);

const sections = computed(() => [...new Set((data.value?.questions ?? []).map((question) => question.section))]);
const criteria = computed(() => (data.value?.criteria ?? []).filter((item) => item.stageKind === tab.value));
const markers = computed(() => (data.value?.markers ?? []).filter((item) => item.stageKind === tab.value));

const TYPE = { SHORT_TEXT: "строка", LONG_TEXT: "развёрнутый", SINGLE_CHOICE: "один вариант", MULTI_CHOICE: "несколько", URL: "ссылка" } as const;

async function post(path: string, body: Record<string, unknown>) {
  problem.value = null;
  const result = await $fetch<{ ok: boolean; message?: string }>(path, { method: "POST", body, ignoreResponseError: true });
  if (!result.ok) problem.value = result.message ?? "Не получилось.";
  await refresh();
}

const move = (kind: string, id: string, direction: -1 | 1) => post("/api/admin/forms/move", { kind, id, direction });
const remove = (kind: string, id: string) => post("/api/admin/forms/delete", { kind, id });

async function saved() {
  editing.value = null;
  await refresh();
}

// Маркер — форма в одну-две строки, поэтому прямо здесь.
const marker = reactive({ title: "", example: "" });
function editMarker(item: Editor["markers"][number] | null) {
  editing.value = item ? `m:${item.id}` : "m:new";
  marker.title = item?.title ?? "";
  marker.example = item?.example ?? "";
}
async function saveMarker(id?: string) {
  await post("/api/admin/forms/marker", { id, stage: tab.value, title: marker.title, example: marker.example || null });
  if (!problem.value) editing.value = null;
}

watch(tab, () => {
  editing.value = null;
  problem.value = null;
});
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
    <StaffAdminNav />
    <div class="flex flex-col gap-1">
      <h1 class="font-display text-3xl">Анкета и оценка</h1>
      <p class="text-ink-soft text-sm">
        Переформулировать можно всегда. Удалить вопрос с ответами или критерий с баллами нельзя — пропали бы данные.
      </p>
    </div>

    <div role="tablist" class="bg-card border-line flex gap-1 overflow-x-auto rounded-2xl border p-1">
      <button
        v-for="item in TABS"
        :key="item.key"
        type="button"
        role="tab"
        :aria-selected="tab === item.key"
        class="min-h-10 shrink-0 rounded-xl px-4 text-sm font-medium"
        :class="tab === item.key ? 'bg-paper' : 'text-ink-soft'"
        @click="tab = item.key"
      >
        {{ item.label }}
      </button>
    </div>

    <UiNotice :message="problem" />

    <!-- Анкета -->
    <section v-if="tab === 'form'" class="flex flex-col gap-3">
      <ol class="bg-card border-line overflow-hidden rounded-3xl border">
        <li v-for="(question, index) in data?.questions ?? []" :key="question.id" class="border-line border-t first:border-t-0">
          <div class="flex items-start gap-3 px-4 py-3">
            <span class="bg-paper text-ink-soft grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold">{{ index + 1 }}</span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">{{ question.label }}</p>
              <p class="text-ink-soft text-xs">
                {{ question.section }} · {{ TYPE[question.type] }}{{ question.required ? "" : " · необязательный" }} · ответов: {{ question.answers }}
              </p>
            </div>
            <div class="flex shrink-0 gap-0.5">
              <button type="button" class="hover:bg-paper grid size-8 place-items-center rounded-lg disabled:opacity-30" :disabled="index === 0" :aria-label="`Выше: ${question.label}`" @click="move('question', question.id, -1)"><ArrowUp class="size-4" /></button>
              <button type="button" class="hover:bg-paper grid size-8 place-items-center rounded-lg disabled:opacity-30" :disabled="index === (data?.questions.length ?? 0) - 1" :aria-label="`Ниже: ${question.label}`" @click="move('question', question.id, 1)"><ArrowDown class="size-4" /></button>
              <button type="button" class="hover:bg-paper grid size-8 place-items-center rounded-lg" :aria-label="`Изменить: ${question.label}`" @click="editing = `q:${question.id}`"><Pencil class="size-4" /></button>
              <button type="button" class="hover:text-danger grid size-8 place-items-center rounded-lg disabled:opacity-30" :disabled="question.answers > 0" :aria-label="`Удалить: ${question.label}`" @click="remove('question', question.id)"><Trash2 class="size-4" /></button>
            </div>
          </div>
          <div v-if="editing === `q:${question.id}`" class="px-4 pb-4">
            <AdminQuestionForm :question="question" :sections="sections" @saved="saved" @cancel="editing = null" />
          </div>
        </li>
      </ol>
      <AdminQuestionForm v-if="editing === 'q:new'" :question="null" :sections="sections" @saved="saved" @cancel="editing = null" />
      <UiButton v-else variant="ghost" @click="editing = 'q:new'"><Plus class="size-4" aria-hidden="true" /> Добавить вопрос</UiButton>
    </section>

    <!-- Оценка этапа -->
    <template v-else>
      <section class="flex flex-col gap-3">
        <h2 class="font-display text-lg">Критерии</h2>
        <ul class="bg-card border-line overflow-hidden rounded-3xl border">
          <li v-for="(criterion, index) in criteria" :key="criterion.id" class="border-line border-t first:border-t-0">
            <div class="flex items-start gap-3 px-4 py-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold">
                  {{ criterion.title }}
                  <span v-if="criterion.badge" class="bg-paper text-ink-soft ml-1 rounded-md px-1.5 py-0.5 text-xs font-normal">{{ criterion.badge }}</span>
                </p>
                <p class="text-ink-soft text-xs">Баллы 0–{{ criterion.maxScore }} · расшифровок: {{ criterion.levels.length }} · поставлено баллов: {{ criterion.scores }}</p>
              </div>
              <div class="flex shrink-0 gap-0.5">
                <button type="button" class="hover:bg-paper grid size-8 place-items-center rounded-lg disabled:opacity-30" :disabled="index === 0" :aria-label="`Выше: ${criterion.title}`" @click="move('criterion', criterion.id, -1)"><ArrowUp class="size-4" /></button>
                <button type="button" class="hover:bg-paper grid size-8 place-items-center rounded-lg disabled:opacity-30" :disabled="index === criteria.length - 1" :aria-label="`Ниже: ${criterion.title}`" @click="move('criterion', criterion.id, 1)"><ArrowDown class="size-4" /></button>
                <button type="button" class="hover:bg-paper grid size-8 place-items-center rounded-lg" :aria-label="`Изменить: ${criterion.title}`" @click="editing = `c:${criterion.id}`"><Pencil class="size-4" /></button>
                <button type="button" class="hover:text-danger grid size-8 place-items-center rounded-lg disabled:opacity-30" :disabled="criterion.scores > 0" :aria-label="`Удалить: ${criterion.title}`" @click="remove('criterion', criterion.id)"><Trash2 class="size-4" /></button>
              </div>
            </div>
            <div v-if="editing === `c:${criterion.id}`" class="px-4 pb-4">
              <AdminCriterionForm :criterion="criterion" :stage="tab as Stage" @saved="saved" @cancel="editing = null" />
            </div>
          </li>
        </ul>
        <AdminCriterionForm v-if="editing === 'c:new'" :criterion="null" :stage="tab as Stage" @saved="saved" @cancel="editing = null" />
        <UiButton v-else variant="ghost" @click="editing = 'c:new'"><Plus class="size-4" aria-hidden="true" /> Добавить критерий</UiButton>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="font-display text-lg">Маркеры</h2>
        <ul class="bg-card border-line overflow-hidden rounded-3xl border">
          <li v-for="(item, index) in markers" :key="item.id" class="border-line border-t first:border-t-0">
            <form v-if="editing === `m:${item.id}`" class="flex flex-col gap-3 p-4" @submit.prevent="saveMarker(item.id)">
              <UiInput v-model="marker.title" label="Маркер" />
              <UiInput v-model="marker.example" label="Пример, что сюда писать" />
              <div class="flex gap-2 sm:w-80">
                <UiButton variant="ghost" @click="editing = null">Отмена</UiButton>
                <UiButton type="submit">Сохранить</UiButton>
              </div>
            </form>
            <div v-else class="flex items-start gap-3 px-4 py-3">
              <div class="min-w-0 flex-1">
                <p class="text-sm font-semibold">{{ item.title }}</p>
                <p class="text-ink-soft text-xs">{{ item.example || "без примера" }} · заметок: {{ item.notes }}</p>
              </div>
              <div class="flex shrink-0 gap-0.5">
                <button type="button" class="hover:bg-paper grid size-8 place-items-center rounded-lg disabled:opacity-30" :disabled="index === 0" :aria-label="`Выше: ${item.title}`" @click="move('marker', item.id, -1)"><ArrowUp class="size-4" /></button>
                <button type="button" class="hover:bg-paper grid size-8 place-items-center rounded-lg disabled:opacity-30" :disabled="index === markers.length - 1" :aria-label="`Ниже: ${item.title}`" @click="move('marker', item.id, 1)"><ArrowDown class="size-4" /></button>
                <button type="button" class="hover:bg-paper grid size-8 place-items-center rounded-lg" :aria-label="`Изменить: ${item.title}`" @click="editMarker(item)"><Pencil class="size-4" /></button>
                <button type="button" class="hover:text-danger grid size-8 place-items-center rounded-lg disabled:opacity-30" :disabled="item.notes > 0" :aria-label="`Удалить: ${item.title}`" @click="remove('marker', item.id)"><Trash2 class="size-4" /></button>
              </div>
            </div>
          </li>
        </ul>
        <form v-if="editing === 'm:new'" class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-4" @submit.prevent="saveMarker()">
          <UiInput v-model="marker.title" label="Маркер" />
          <UiInput v-model="marker.example" label="Пример, что сюда писать" />
          <div class="flex gap-2 sm:w-80">
            <UiButton variant="ghost" @click="editing = null">Отмена</UiButton>
            <UiButton type="submit">Сохранить</UiButton>
          </div>
        </form>
        <UiButton v-else variant="ghost" @click="editMarker(null)"><Plus class="size-4" aria-hidden="true" /> Добавить маркер</UiButton>
      </section>
    </template>
  </main>
</template>
