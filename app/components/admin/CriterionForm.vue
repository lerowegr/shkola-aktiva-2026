<script setup lang="ts">
/** Форма критерия: название, пометка, описание, шкала и что значит каждый балл. */
interface Criterion {
  id?: string;
  title: string;
  badge: string | null;
  description?: string | null;
  maxScore: number;
  levels: { score: number; text: string }[];
}

const props = defineProps<{ criterion: Criterion | null; stage: "APPLICATION" | "HOMEWORK" | "ASSESSMENT" | "INTERVIEW" }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();

const form = reactive({
  title: props.criterion?.title ?? "",
  badge: props.criterion?.badge ?? "",
  description: props.criterion?.description ?? "",
  maxScore: props.criterion?.maxScore ?? 4,
  texts: {} as Record<number, string>,
});
for (const level of props.criterion?.levels ?? []) form.texts[level.score] = level.text;

const save = useAction("/api/admin/forms/criterion");
async function submit() {
  const result = await save.submit({
    id: props.criterion?.id,
    stage: props.stage,
    title: form.title,
    badge: form.badge || null,
    description: form.description || null,
    maxScore: form.maxScore,
    levels: Array.from({ length: form.maxScore + 1 }, (_, score) => ({ score, text: form.texts[score] ?? "" })),
  });
  if (result.ok) emit("saved");
}
</script>

<template>
  <form class="bg-paper flex flex-col gap-4 rounded-2xl p-4" @submit.prevent="submit">
    <div class="grid gap-4 sm:grid-cols-[1fr_180px_120px]">
      <UiInput v-model="form.title" label="Критерий" />
      <UiInput v-model="form.badge" label="Пометка — например «Сквозная»" />
      <label class="flex flex-col gap-1.5 text-sm font-medium">
        Баллы от 0 до
        <input v-model.number="form.maxScore" type="number" min="1" max="10" class="border-line bg-card min-h-12 rounded-2xl border px-4 text-base" >
      </label>
    </div>
    <label class="flex flex-col gap-1.5 text-sm font-medium">
      Что это за характеристика — эксперт увидит при оценке, необязательно
      <textarea v-model="form.description" rows="2" maxlength="1000" class="border-line bg-card field-sizing-content min-h-12 rounded-2xl border px-4 py-3 text-sm font-normal" />
    </label>
    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1 text-sm font-medium">Что значит балл — можно не для каждого</legend>
      <label v-for="score in form.maxScore + 1" :key="score" class="flex items-start gap-3">
        <span class="text-accent mt-3 w-4 text-sm font-semibold">{{ score - 1 }}</span>
        <textarea v-model="form.texts[score - 1]" rows="1" maxlength="1500" class="border-line bg-card field-sizing-content flex-1 rounded-xl border px-3 py-2.5 text-sm" />
      </label>
    </fieldset>
    <UiNotice :message="save.result.value?.ok ? null : save.result.value?.message" />
    <div class="flex gap-2 sm:w-80">
      <UiButton variant="ghost" @click="emit('cancel')">Отмена</UiButton>
      <UiButton type="submit" :pending="save.pending.value">Сохранить</UiButton>
    </div>
  </form>
</template>
