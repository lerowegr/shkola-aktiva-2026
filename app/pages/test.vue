<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";

useHead({ title: "Тест про ША" });
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 py-6">
    <NuxtLink
      to="/tg"
      class="text-ink-soft hover:text-ink inline-flex min-h-11 items-center gap-1 self-start text-sm"
    >
      <ArrowLeft class="size-4" aria-hidden="true" /> К выбору
    </NuxtLink>
    <h1 class="font-display text-3xl">Тест про ША</h1>
    <ClientOnly>
      <GameShaTest />
      <template #fallback>
        <p class="text-ink-soft" aria-live="polite">Загружаем тест…</p>
      </template>
    </ClientOnly>
  </main>
</template>
