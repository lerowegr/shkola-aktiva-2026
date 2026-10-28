<script setup lang="ts">
import { ExternalLink } from "lucide-vue-next";
import type { HomeworkLink } from "~~/lib/applications/homework";

defineProps<{ links: HomeworkLink[]; name: string }>();
</script>

<template>
  <div class="flex flex-wrap items-center gap-1">
    <a
      v-for="(link, index) in links"
      :key="link.url"
      :href="link.url"
      target="_blank"
      rel="noopener noreferrer"
      :title="link.label"
      :aria-label="`${name}: ${link.label} (в новой вкладке)`"
      class="text-accent hover:bg-accent/10 focus-visible:ring-accent inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
    >
      {{ links.length === 1 ? 'ДЗ' : `ДЗ ${index + 1}` }}
      <ExternalLink class="size-4" aria-hidden="true" />
    </a>
    <span v-if="!links.length" class="text-ink-soft py-2 text-xs">Нет ссылки на ДЗ</span>
  </div>
</template>
