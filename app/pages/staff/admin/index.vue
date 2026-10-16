<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";

/**
 * Админка — оглавление: разделы, на которые есть право. Из каждого раздела
 * сюда ведёт «← Все разделы» в подменю.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Админка" });

const items = await useAdminSections();
</script>

<template>
  <main class="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
    <div class="flex flex-col gap-1">
      <h1 class="font-display text-3xl">Админка</h1>
      <p class="text-ink-soft text-sm">Настройка отбора, люди и права, тексты сайта, рассылки и журнал.</p>
    </div>
    <ul class="grid gap-3 sm:grid-cols-2">
      <li v-for="item in items" :key="item.to">
        <NuxtLink :to="item.to" class="bg-card border-line hover:border-ink-soft flex h-full items-center gap-3 rounded-3xl border p-4 transition">
          <span class="flex-1">
            <span class="block font-semibold">{{ item.label }}</span>
            <span class="text-ink-soft block text-sm">{{ item.about }}</span>
          </span>
          <ChevronRight class="text-ink-soft size-5 shrink-0" aria-hidden="true" />
        </NuxtLink>
      </li>
    </ul>
    <p v-if="items.length === 0" class="text-ink-soft text-sm">Разделов админки вам не выдано.</p>
  </main>
</template>
