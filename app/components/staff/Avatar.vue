<script setup lang="ts">
/** Кружок человека: фото, если есть, иначе инициалы цветом по seed. */
defineProps<{ seed: string; text: string; size?: "sm" | "md"; src?: string | null }>();
</script>

<template>
  <span
    class="grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold"
    :class="[avatarTone(seed), size === 'md' ? 'size-11 text-sm' : 'size-9 text-xs']"
    aria-hidden="true"
  >
    <img v-if="src" :src="src" alt="" class="size-full object-cover" loading="lazy">
    <template v-else>{{ text }}</template>
  </span>
</template>
