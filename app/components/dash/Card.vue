<script setup lang="ts">
defineProps<{ title: string; hint?: string }>();
</script>

<template>
  <section class="bg-card border-line flex min-w-0 flex-col gap-4 rounded-2xl border p-4 sm:p-5">
    <header class="flex flex-col gap-1">
      <h2 class="text-base font-semibold">{{ title }}</h2>
      <p v-if="hint" class="text-ink-soft text-sm">{{ hint }}</p>
    </header>
    <slot />
  </section>
</template>
