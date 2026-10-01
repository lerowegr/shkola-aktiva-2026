<script setup lang="ts">
import type { ReviewStatus } from "~~/lib/applications/review";

defineProps<{ status: ReviewStatus }>();

const LABEL: Record<ReviewStatus, string> = { new: "Не проверена", progress: "В работе", done: "Проверена" };
</script>

<template>
  <span
    class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap"
    :class="{
      'bg-paper text-ink-soft': status === 'new',
      'bg-brand-yellow-soft text-[#7a5d00]': status === 'progress',
      'bg-brand-green-soft text-ok': status === 'done',
    }"
  >
    <span
      class="size-1.5 rounded-full"
      :class="{ 'bg-ink-soft': status === 'new', 'bg-brand-yellow': status === 'progress', 'bg-ok': status === 'done' }"
    />
    {{ LABEL[status] }}
  </span>
</template>
