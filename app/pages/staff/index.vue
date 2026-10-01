<script setup lang="ts">
import type { ListResult } from "~~/lib/applications/staff";

/** «Мои анкеты» — назначенные мне. Остальное — во «Всех анкетах». */
definePageMeta({ layout: "staff" });
useHead({ title: "Мои анкеты" });

const { data: nav } = await useFetch("/api/staff/nav", { key: "staff-nav" });

// Без права проверять «Моих анкет» нет — ведём туда, где человеку есть что делать.
if (nav.value && !nav.value.can.review) {
  await navigateTo(nav.value.can.viewAll ? "/staff/all" : nav.value.can.stages ? "/staff/stages" : "/cabinet", {
    replace: true,
  });
}

// Счётчики — своим запросом, который страница дожидается: тогда сервер
// рисует настоящие цифры, а не нули до загрузки списка.
const { data: summary } = await useFetch<ListResult>("/api/staff/applications", {
  query: { scope: "mine" },
  key: "staff-mine-summary",
  pick: ["counts"],
});
const counts = computed(() => summary.value?.counts ?? { all: 0, todo: 0, done: 0 });
const percent = computed(() => (counts.value.all ? Math.round((counts.value.done / counts.value.all) * 100) : 0));
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <div class="flex flex-col gap-1">
      <h1 class="font-display text-3xl">Мои анкеты</h1>
      <p class="text-ink-soft text-sm">Анкеты, которые назначили вам. Откройте анкету — оценка сохраняется сама.</p>
    </div>

    <div v-if="nav?.stages.APPLICATION === 'upcoming'" class="bg-card border-line text-ink-soft rounded-3xl border p-8 text-center">
      Этап анкет ещё не начался — здесь появятся анкеты, как только кандидаты начнут их отправлять.
    </div>

    <template v-else>
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="bg-accent text-accent-ink relative overflow-hidden rounded-3xl p-5">
          <span class="bg-brand-green-soft absolute -top-10 -right-10 size-32 rounded-full" aria-hidden="true" />
          <p class="relative text-sm text-white/80">Назначено вам</p>
          <p class="font-display relative mt-3 text-4xl">{{ counts.all }}</p>
          <p class="relative text-sm text-white/80">анкет на проверку</p>
        </div>
        <div class="bg-card border-line rounded-3xl border p-5">
          <p class="text-ink-soft text-sm">Проверено</p>
          <p class="font-display mt-3 text-4xl">{{ counts.done }}</p>
          <div class="bg-paper mt-3 h-1.5 overflow-hidden rounded-full">
            <div class="bg-accent h-full rounded-full transition-all" :style="{ width: `${percent}%` }" />
          </div>
          <p class="text-ink-soft mt-1.5 text-xs">{{ percent }}% назначенных</p>
        </div>
        <div class="bg-card border-line rounded-3xl border p-5">
          <p class="text-ink-soft text-sm">Осталось проверить</p>
          <p class="font-display mt-3 text-4xl">{{ counts.todo }}</p>
          <p class="text-ink-soft text-sm">из {{ counts.all }}</p>
        </div>
      </div>

      <StaffApplicationList scope="mine" />
    </template>
  </main>
</template>
