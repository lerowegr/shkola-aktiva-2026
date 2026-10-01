<script setup lang="ts">
/** Многострочное поле с подписью и счётчиком знаков, если задан предел. */
defineProps<{ label: string; rows?: number; max?: number; hint?: string | null }>();

const model = defineModel<string>({ default: "" });
const id = useId();
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <label :for="id" class="text-sm font-medium">{{ label }}</label>
    <textarea
      :id="id"
      v-model="model"
      :rows="rows ?? 3"
      :aria-describedby="`${id}-hint`"
      :aria-invalid="(max !== undefined && model.length > max) || undefined"
      class="border-line bg-card focus:border-accent focus:ring-accent/20 aria-invalid:border-danger rounded-2xl border px-4 py-3 text-base outline-none focus:ring-4"
    />
    <p :id="`${id}-hint`" class="text-ink-soft flex justify-between gap-3 text-sm">
      <span>{{ hint }}</span>
      <span v-if="max" class="shrink-0 tabular-nums" :class="{ 'text-danger': model.length > max }">
        {{ model.length }}/{{ max }}
      </span>
    </p>
  </div>
</template>
