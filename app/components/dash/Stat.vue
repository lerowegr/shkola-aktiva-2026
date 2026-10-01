<script setup lang="ts">
/** Плитка с одним числом: подпись, значение, пояснение под ним. */
defineProps<{ label: string; value: string; note?: string; good?: boolean }>();
</script>

<template>
  <div class="bg-card border-line flex min-w-0 flex-col gap-1 rounded-2xl border p-4">
    <p class="text-ink-soft text-sm">{{ label }}</p>
    <p class="text-3xl font-semibold">{{ value }}</p>
    <p v-if="note" class="text-sm" :class="good ? 'text-ok' : 'text-ink-soft'">{{ note }}</p>
  </div>
</template>
