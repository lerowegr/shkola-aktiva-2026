<script setup lang="ts">
/** Форма вопроса анкеты — новой или существующей. */
interface Question {
  id?: string;
  section: string;
  type: "SHORT_TEXT" | "LONG_TEXT" | "SINGLE_CHOICE" | "MULTI_CHOICE" | "URL";
  label: string;
  help: string | null;
  required: boolean;
  options: string[];
  maxLength: number | null;
  answers?: number;
}

const props = defineProps<{ question: Question | null; sections: string[] }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();

const form = reactive({
  section: props.question?.section ?? props.sections.at(-1) ?? "О себе",
  type: props.question?.type ?? "LONG_TEXT",
  label: props.question?.label ?? "",
  help: props.question?.help ?? "",
  required: props.question?.required ?? true,
  options: (props.question?.options ?? []).join("\n"),
  maxLength: props.question?.maxLength ?? 3000,
});

const TYPES = [
  { key: "SHORT_TEXT", label: "Строка" },
  { key: "LONG_TEXT", label: "Развёрнутый ответ" },
  { key: "SINGLE_CHOICE", label: "Один вариант" },
  { key: "MULTI_CHOICE", label: "Несколько вариантов" },
  { key: "URL", label: "Ссылка" },
] as const;

const choice = computed(() => form.type === "SINGLE_CHOICE" || form.type === "MULTI_CHOICE");
const locked = computed(() => (props.question?.answers ?? 0) > 0);
const save = useAction("/api/admin/forms/question");

async function submit() {
  const result = await save.submit({
    id: props.question?.id,
    section: form.section,
    type: form.type,
    label: form.label,
    help: form.help || null,
    required: form.required,
    options: choice.value ? form.options.split("\n") : [],
    maxLength: choice.value ? null : form.maxLength || null,
  });
  if (result.ok) emit("saved");
}
</script>

<template>
  <form class="bg-paper flex flex-col gap-4 rounded-2xl p-4" @submit.prevent="submit">
    <UiInput v-model="form.label" label="Вопрос" />
    <UiInput v-model="form.help" label="Подсказка под вопросом — необязательно" />
    <div class="grid gap-4 sm:grid-cols-2">
      <label class="flex flex-col gap-1.5 text-sm font-medium">
        Раздел
        <input v-model="form.section" list="sections" class="border-line bg-card min-h-12 rounded-2xl border px-4 text-base" >
        <datalist id="sections"><option v-for="section in sections" :key="section" :value="section" /></datalist>
      </label>
      <label class="flex flex-col gap-1.5 text-sm font-medium">
        Вид ответа
        <select v-model="form.type" :disabled="locked" class="border-line bg-card min-h-12 rounded-2xl border px-4 text-base disabled:opacity-60">
          <option v-for="type in TYPES" :key="type.key" :value="type.key">{{ type.label }}</option>
        </select>
        <span v-if="locked" class="text-ink-soft text-xs font-normal">На вопрос уже отвечали — вид не меняется.</span>
      </label>
    </div>
    <label v-if="choice" class="flex flex-col gap-1.5 text-sm font-medium">
      Варианты — каждый с новой строки
      <textarea v-model="form.options" rows="4" class="border-line bg-card rounded-2xl border px-4 py-3 text-base font-normal" />
    </label>
    <UiInput v-else :model-value="String(form.maxLength ?? '')" label="Не длиннее, знаков" inputmode="numeric" @update:model-value="form.maxLength = Number($event) || 0" />
    <label class="flex items-center gap-2 text-sm">
      <input v-model="form.required" type="checkbox" class="accent-accent size-4" > Обязательный вопрос
    </label>
    <UiNotice :message="save.result.value?.ok ? null : save.result.value?.message" />
    <div class="flex gap-2 sm:w-80">
      <UiButton variant="ghost" @click="emit('cancel')">Отмена</UiButton>
      <UiButton type="submit" :pending="save.pending.value">Сохранить</UiButton>
    </div>
  </form>
</template>
