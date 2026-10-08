<script setup lang="ts">
import { Check } from "lucide-vue-next";

/**
 * Чекбокс в стиле брендбука: свой квадрат с галочкой вместо нативного.
 * Внутри — настоящий input, поэтому работают клавиатура и скринридеры.
 * v-model — boolean или массив (с :value).
 */
const props = withDefaults(defineProps<{ value?: string; disabled?: boolean }>(), {
  value: undefined,
  disabled: false,
});

const model = defineModel<boolean | string[]>({ default: false });

const checked = computed(() =>
  Array.isArray(model.value) ? (props.value !== undefined && model.value.includes(props.value)) : model.value === true,
);

function toggle() {
  if (props.disabled) return;
  if (Array.isArray(model.value)) {
    if (props.value === undefined) return;
    model.value = checked.value ? model.value.filter((item) => item !== props.value) : [...model.value, props.value];
  } else {
    model.value = !checked.value;
  }
}
</script>

<template>
  <label class="inline-flex cursor-pointer items-start gap-2 text-sm" :class="{ 'cursor-not-allowed opacity-60': disabled }">
    <input
      type="checkbox"
      class="peer sr-only"
      :checked="checked"
      :disabled="disabled"
      @change="toggle"
    >
    <span
      class="border-line bg-card mt-[3px] grid size-5 shrink-0 place-items-center rounded-md border transition peer-focus-visible:ring-accent peer-focus-visible:ring-4 peer-focus-visible:outline-none"
      :class="checked ? 'border-accent bg-accent text-accent-ink' : ''"
      aria-hidden="true"
    >
      <Check v-if="checked" class="size-3.5" stroke-width="3.5" />
    </span>
    <span class="min-w-0"><slot /></span>
  </label>
</template>
