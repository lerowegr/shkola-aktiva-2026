<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";

/** Подменю админки: «← Все разделы» и разделы, на которые есть право. */
const items = await useAdminSections();
const route = useRoute();
</script>

<template>
  <div class="flex flex-col gap-3">
    <NuxtLink to="/staff/admin" class="text-ink-soft hover:text-ink inline-flex items-center gap-1 self-start text-sm">
      <ArrowLeft class="size-4" aria-hidden="true" /> Все разделы админки
    </NuxtLink>
    <nav class="bg-card border-line flex gap-1 overflow-x-auto rounded-2xl border p-1" aria-label="Разделы админки">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="min-h-10 shrink-0 rounded-xl px-4 text-sm leading-10 font-medium"
        :class="route.path === item.to ? 'bg-paper' : 'text-ink-soft hover:text-ink'"
      >
        {{ item.label }}
      </NuxtLink>
    </nav>
  </div>
</template>
