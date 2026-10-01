<script setup lang="ts">
/** Ответ сервера человеческим языком: зелёный — получилось, красный — нет. */
defineProps<{ ok?: boolean; message?: string | null }>();
</script>

<template>
  <p
    v-if="message"
    role="status"
    aria-live="polite"
    class="rounded-2xl px-4 py-3 text-sm"
    :class="ok ? 'bg-ok/10 text-ok' : 'bg-danger/10 text-danger'"
  >
    {{ message }}
  </p>
</template>
