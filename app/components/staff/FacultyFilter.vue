<script setup lang="ts">
import { FACULTY_OPTIONS, type FacultyFilter } from "~~/lib/profile/faculty";

/**
 * Выбор факультета для списков организатора. counts — сколько людей на
 * каждом факультете (ключ — значение фильтра), если страница их знает.
 */
const props = defineProps<{ counts?: Partial<Record<string, number>> }>();
const model = defineModel<FacultyFilter>({ required: true });

const label = (option: { value: string; label: string }) => {
  const count = option.value ? props.counts?.[option.value] : undefined;
  return count === undefined ? option.label : `${option.label} · ${count}`;
};
</script>

<template>
  <UiSelect v-model="model" size="md" aria-label="Факультет" class="sm:w-52">
    <option v-for="option in FACULTY_OPTIONS" :key="option.value" :value="option.value">{{ label(option) }}</option>
  </UiSelect>
</template>
