<script setup lang="ts">
defineProps<{ seed: string; text: string; size?: "sm" | "md" }>();
</script>

<template>
  <span
    class="grid shrink-0 place-items-center rounded-full font-semibold"
    :class="[avatarTone(seed), size === 'md' ? 'size-11 text-sm' : 'size-9 text-xs']"
    aria-hidden="true"
  >
    {{ text }}
  </span>
</template>
