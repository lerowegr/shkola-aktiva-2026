<script setup lang="ts">
/**
 * «Центр оценки» — домашние задания. Та же оценка, что у анкет: свои
 * работы проверяю, чужие смотрю.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Центр оценки" });

const { data: nav } = await useFetch("/api/staff/nav", { key: "staff-nav" });

const scope = ref<"mine" | "all">(nav.value?.can.review ? "mine" : "all");
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex flex-col gap-1">
        <h1 class="font-display text-3xl">Центр оценки</h1>
        <p class="text-ink-soft max-w-xl text-sm">
          Домашние задания. Работа приходит тому же мастеру, что проверял анкету. Пересданная версия заменяет прежнюю —
          обе видны в карточке.
        </p>
      </div>

      <div v-if="nav?.can.review && nav?.can.viewAll" role="tablist" class="bg-card border-line grid grid-cols-2 gap-1 rounded-2xl border p-1">
        <button
          v-for="item in [
            { key: 'mine', label: 'Мои работы' },
            { key: 'all', label: 'Все работы' },
          ] as const"
          :key="item.key"
          type="button"
          role="tab"
          :aria-selected="scope === item.key"
          class="min-h-10 rounded-xl px-4 text-sm font-medium"
          :class="scope === item.key ? 'bg-paper' : 'text-ink-soft'"
          @click="scope = item.key"
        >
          {{ item.label }}
        </button>
      </div>
    </div>

    <StaffApplicationList :key="scope" :scope="scope" stage="HOMEWORK" />
  </main>
</template>
