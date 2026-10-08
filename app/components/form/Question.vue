<script setup lang="ts">
import { FORMAT_EXAMPLE, formatValue, plural, type AnswerValue } from "~~/lib/applications/form";

/**
 * Один вопрос анкеты в нужном виде: строка, развёрнутый ответ, выбор
 * одного или нескольких вариантов, ссылка. В режиме чтения — просто ответ.
 *
 * У строки с форматом — своя клавиатура на телефоне и пример; уходя с поля,
 * верный ввод приводится к единому виду (vk.com/ivan → https://vk.ru/ivan).
 * У ответа с минимумом — счётчик «N из 200».
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
    minLength?: number | null;
    format?: "DIGITS" | "GROUP" | "PHONE" | "VK" | "TELEGRAM" | null;
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

// Клавиатура и пример под формат.
const INPUT_MODE = { DIGITS: "numeric", PHONE: "tel", GROUP: "text", VK: "url", TELEGRAM: "text" } as const;
const inputMode = computed(() =>
  props.question.format ? INPUT_MODE[props.question.format] : props.question.type === "URL" ? "url" : "text",
);
const placeholder = computed(() => {
  if (props.question.format) return `Например, ${FORMAT_EXAMPLE[props.question.format]}`;
  return props.question.type === "URL" ? "vk.ru/…" : "Ваш ответ";
});

function tidy() {
  if (!props.question.format || typeof model.value !== "string") return;
  const formatted = formatValue(props.question.format, model.value);
  if (formatted.ok && formatted.value !== model.value) model.value = formatted.value;
}

// Счётчик до минимума: «150 из 200», дописал — зелёная галочка в тексте.
const length = computed(() => text.value.trim().length);
const counter = computed(() => {
  const min = props.question.minLength;
  if (!min || props.readonly) return null;
  if (length.value >= min) return { done: true, text: `${length.value} ${plural(length.value, "знак", "знака", "знаков")} — достаточно` };
  return { done: false, text: `${length.value} из ${min} — нужно развёрнуто` };
});

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
      :type="question.type === 'URL' && !question.format ? 'url' : question.format === 'PHONE' ? 'tel' : 'text'"
      :inputmode="inputMode"
      :autocomplete="question.format === 'PHONE' ? 'tel' : 'off'"
      :autocapitalize="question.format === 'GROUP' ? 'characters' : 'off'"
      :maxlength="question.maxLength ?? undefined"
      :aria-invalid="!!error || undefined"
      :placeholder="placeholder"
      class="border-line bg-paper focus:border-accent focus:ring-accent/20 min-h-12 rounded-2xl border px-4 text-base outline-none focus:ring-4 sm:ml-10"
      @blur="tidy"
    >

    <!-- Счётчик — после всей цепочки v-if/v-else: внутри неё он рвал бы её. -->
    <p v-if="counter && !readonly" class="text-sm sm:pl-10" :class="counter.done ? 'text-ok' : 'text-ink-soft'" aria-live="polite">
      {{ counter.text }}
    </p>
    <p v-if="error" class="text-danger text-sm sm:pl-10">{{ error }}</p>
  </div>
</template>
