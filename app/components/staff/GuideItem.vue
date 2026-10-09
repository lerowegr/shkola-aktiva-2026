<script setup lang="ts">
import type { ActionResult } from "~/composables/useAction";
import type { GuideItem } from "~~/lib/interviews/guide";

/**
 * Вопрос сценария собеса: текст на всю ширину, под ним ячейки мастеров.
 * Своя ячейка — поле с автосохранением, чужие — только чтение.
 */
const props = defineProps<{ item: GuideItem; applicationId: string; canWrite: boolean }>();

const mine = computed(() => props.item.notes.find((note) => note.isMine) ?? null);
const others = computed(() => props.item.notes.filter((note) => !note.isMine));

const draft = ref(mine.value?.note ?? "");
watch(
  () => mine.value?.note,
  (note) => {
    draft.value = note ?? "";
  },
);

const autosave = useAutosave(700);
const failed = ref<string | null>(null);

async function persist(value: string): Promise<ActionResult> {
  const result = await $fetch<ActionResult>("/api/staff/interviews/note", {
    method: "POST",
    body: { applicationId: props.applicationId, questionId: props.item.id, note: value },
    ignoreResponseError: true,
  });
  failed.value = result.ok ? null : (result.message ?? "Не сохранилось.");
  return result;
}

function onInput() {
  autosave.schedule(props.item.id, () => persist(draft.value));
  void autosave.flush();
}

onBeforeUnmount(() => {
  void autosave.flush();
});
</script>

<template>
  <div class="flex flex-col gap-2">
    <p class="whitespace-pre-line text-sm font-medium">{{ item.text }}</p>
    <div v-if="!item.intro" class="grid gap-2 sm:grid-cols-2">
      <div v-if="canWrite" class="bg-paper flex min-h-24 flex-col gap-1 rounded-2xl p-3">
        <p class="text-ink-soft text-xs">Ваш комментарий</p>
        <textarea
          v-model="draft"
          rows="2"
          maxlength="2000"
          placeholder="Что ответил, как держался…"
          class="min-h-16 w-full resize-y bg-transparent text-sm outline-none placeholder:text-ink-soft/60"
          @input="onInput"
        />
        <p v-if="autosave.state.value === 'saving'" class="text-ink-soft text-xs">Сохраняем…</p>
        <p v-else-if="failed" class="text-danger text-xs">{{ failed }}</p>
      </div>
      <div
        v-for="note in others"
        :key="note.authorId"
        class="bg-paper flex min-h-24 flex-col gap-1 rounded-2xl p-3"
      >
        <p class="text-ink-soft text-xs">{{ note.authorName }}</p>
        <p class="whitespace-pre-line text-sm">{{ note.note }}</p>
      </div>
      <p v-if="canWrite && others.length === 0 && !mine" class="text-ink-soft text-xs sm:col-span-2">
        Второй мастер ещё ничего не написал — ячейка появится здесь.
      </p>
    </div>
  </div>
</template>
