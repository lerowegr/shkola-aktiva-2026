<script setup lang="ts">
import type { HomeworkView } from "~~/lib/applications/homework";

/**
 * Домашнее задание — теперь часть анкеты. Пока анкета черновик, сдаётся
 * последним шагом анкеты (сюда же ведут старые ссылки); после отправки —
 * здесь можно посмотреть, что ушло.
 */
useHead({ title: "Домашнее задание" });

const { data } = await useFetch<{ homework: HomeworkView | null }>("/api/cabinet/homework");
const hw = computed(() => data.value?.homework ?? null);
if (hw.value && !hw.value.sent && hw.value.canSubmit) await navigateTo("/cabinet/application", { replace: true });
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div class="flex flex-col gap-1">
        <NuxtLink to="/cabinet" class="text-ink-soft hover:text-ink text-sm">← Кабинет</NuxtLink>
        <h1 class="font-display text-3xl">Домашнее задание</h1>
        <p class="text-ink-soft">Домашнее задание — часть анкеты: сдаётся последним шагом и уходит вместе с ней.</p>
      </div>
      <p v-if="!hw" class="text-ink-soft">Отбор ещё не заведён.</p>
      <AppHomeworkStep v-else :hw="hw" />
      <UiButton v-if="hw && !hw.sent" variant="ghost" href="/cabinet/application">К анкете</UiButton>
    </main>
  </div>
</template>
