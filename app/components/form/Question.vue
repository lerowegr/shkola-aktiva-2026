<script setup lang="ts">
import type { AnswerValue } from "~~/lib/applications/form";

/**
 * Один вопрос анкеты в нужном виде: строка, развёрнутый ответ, выбор
 * одного или нескольких вариантов, ссылка. В режиме чтения — просто ответ.
 */
const props = defineProps<{
  number: number;
  question: {
    id: string;
    type: "SHORT_TEXT" | "LONG_TEXT" | "SINGLE_CHOICE" | "MULTI_CHOICE" | "URL";
    label: string;
    help: string | null;
    required: boolean;
    options: string[];
    maxLength: number | null;
  };
  readonly?: boolean;
  error?: string | null;
}>();

const model = defineModel<AnswerValue | undefined>();
const id = useId();

const text = computed({
  get: () => (typeof model.value === "string" ? model.value : ""),
  set: (value: string) => (model.value = value),
});

const chosen = computed(() => (Array.isArray(model.value) ? model.value : []));

function choose(option: string) {
  if (props.readonly) return;
  if (props.question.type === "SINGLE_CHOICE") {
    model.value = model.value === option ? "" : option;
    return;
  }
  model.value = chosen.value.includes(option)
    ? chosen.value.filter((item) => item !== option)
    : [...chosen.value, option];
}

function selected(option: string) {
  return props.question.type === "SINGLE_CHOICE" ? model.value === option : chosen.value.includes(option);
}

// Развёрнутый ответ растёт вместе с текстом, без полосы прокрутки внутри.
const area = ref<HTMLTextAreaElement | null>(null);
function grow() {
  if (!area.value) return;
  area.value.style.height = "auto";
  area.value.style.height = `${area.value.scrollHeight + 2}px`;
}
onMounted(grow);
watch(text, () => nextTick(grow));

const shown = computed(() => {
  if (Array.isArray(model.value)) return model.value.join(", ");
  return model.value ?? "";
});
</script>

<template>
  <div
    :id="`q-${question.id}`"
    class="bg-card flex flex-col gap-3 rounded-3xl border p-4 sm:p-5"
    :class="error ? 'border-danger' : 'border-line'"
  >
    <div class="flex gap-3">
      <span class="bg-paper text-ink-soft grid size-7 shrink-0 place-items-center rounded-lg text-xs font-semibold">
        {{ number }}
      </span>
      <div class="flex min-w-0 flex-col gap-1">
        <label :for="id" class="font-medium">
          {{ question.label }}
          <span v-if="!question.required" class="text-ink-soft font-normal">— необязательно</span>
        </label>
        <p v-if="question.help" class="text-ink-soft text-sm">{{ question.help }}</p>
      </div>
    </div>

    <p v-if="readonly" class="pl-10 whitespace-pre-line" :class="shown ? '' : 'text-ink-soft'">
      {{ shown || "Нет ответа" }}
    </p>

    <div
      v-else-if="question.type === 'SINGLE_CHOICE' || question.type === 'MULTI_CHOICE'"
      :role="question.type === 'SINGLE_CHOICE' ? 'radiogroup' : 'group'"
      :aria-labelledby="id"
      class="flex flex-wrap gap-2 sm:pl-10"
    >
      <button
        v-for="option in question.options"
        :key="option"
        type="button"
        :role="question.type === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'"
        :aria-checked="selected(option)"
        class="min-h-11 rounded-2xl border px-4 text-sm font-medium transition"
        :class="
          selected(option)
            ? 'border-ink bg-ink text-paper'
            : 'border-line bg-paper hover:border-ink-soft'
        "
        @click="choose(option)"
      >
        {{ option }}
      </button>
    </div>

    <textarea
      v-else-if="question.type === 'LONG_TEXT'"
      :id="id"
      ref="area"
      v-model="text"
      rows="3"
      :maxlength="question.maxLength ?? undefined"
      :aria-invalid="!!error || undefined"
      class="border-line bg-paper focus:border-accent focus:ring-accent/20 min-h-24 resize-none rounded-2xl border px-4 py-3 text-base outline-none focus:ring-4 sm:ml-10"
      placeholder="Ваш ответ"
    />

    <input
      v-else
      :id="id"
      v-model="text"
      :type="question.type === 'URL' ? 'url' : 'text'"
      :inputmode="question.type === 'URL' ? 'url' : 'text'"
      :maxlength="question.maxLength ?? undefined"
      :aria-invalid="!!error || undefined"
      :placeholder="question.type === 'URL' ? 'vk.com/…' : 'Ваш ответ'"
      class="border-line bg-paper focus:border-accent focus:ring-accent/20 min-h-12 rounded-2xl border px-4 text-base outline-none focus:ring-4 sm:ml-10"
    >

    <p v-if="error" class="text-danger text-sm sm:pl-10">{{ error }}</p>
  </div>
</template>
