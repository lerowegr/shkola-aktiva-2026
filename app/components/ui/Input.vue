<script setup lang="ts">
/** Поле ввода с подписью. Подсказка под полем — для правил и ошибок. */
defineProps<{
  label: string;
  type?: string;
  autocomplete?: string;
  inputmode?: "text" | "email" | "numeric";
  placeholder?: string;
  hint?: string | null;
  invalid?: boolean;
  autofocus?: boolean;
}>();

const model = defineModel<string>({ default: "" });
const id = useId();
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-sm font-medium">{{ label }}</label>
    <input
      :id="id"
      v-model="model"
      :type="type ?? 'text'"
      :autocomplete="autocomplete"
      :inputmode="inputmode"
      :placeholder="placeholder"
      :autofocus="autofocus"
      :aria-invalid="invalid || undefined"
      :aria-describedby="hint ? `${id}-hint` : undefined"
      class="border-line bg-card placeholder:text-ink-soft/60 focus:border-accent focus:ring-accent/20 min-h-12 rounded-2xl border px-4 text-base outline-none focus:ring-4 aria-invalid:border-danger"
    >
    <p v-if="hint" :id="`${id}-hint`" class="text-sm" :class="invalid ? 'text-danger' : 'text-ink-soft'">
      {{ hint }}
    </p>
  </div>
</template>
