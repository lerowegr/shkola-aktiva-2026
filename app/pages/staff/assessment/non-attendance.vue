<script setup lang="ts">
import { RefreshCw } from "lucide-vue-next";
definePageMeta({ layout: "staff" });
useHead({ title: "ЦО не пройден — по дням" });
const faculty = useFacultyFilter();
const day = ref("");
const { data, status, error, refresh } = await useFetch("/api/staff/assessment/non-attendance", { query: { faculty } });
watch(() => data.value?.days, values => { if (day.value && !values?.some(d => d.key === day.value)) day.value = ""; });
const groups = computed(() => (data.value?.days ?? []).filter(d => !day.value || d.key === day.value));
const title = (d: { day: string | null; reserve: boolean }) => d.day ? `${mskFormat(`${d.day}T12:00:00+03:00`, 'EEEE, d MMMM')}${d.reserve ? ' · резерв' : ''}` : d.reserve ? 'Резерв — день не выбран' : 'Без назначенного дня';
</script>
<template>
  <main class="mx-auto flex max-w-5xl flex-col gap-5 px-4 py-8">
    <NuxtLink to="/staff/assessment" class="text-accent text-sm">← Центр оценки</NuxtLink>
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div class="flex flex-col gap-2"><h1 class="font-display text-3xl">ЦО не пройден — по дням</h1><p class="text-ink-soft text-sm">Кандидаты без отметки «пришёл» после завершившегося дня ЦО. Резерв включён. Приходившие на ЦО смогут записаться на собеседование после отметки явки организатором.</p></div>
      <UiButton variant="ghost" :pending="status === 'pending'" @click="refresh()"><RefreshCw class="size-4" aria-hidden="true" />Обновить</UiButton>
    </div>
    <div class="flex flex-col gap-3 sm:flex-row"><StaffFacultyFilter v-model="faculty" /><UiSelect v-model="day" aria-label="День ЦО"><option value="">Все дни и резерв</option><option v-for="d in data?.days ?? []" :key="d.key" :value="d.key">{{ title(d) }} · {{ d.people.length }}</option></UiSelect></div>
    <p v-if="error" role="alert" class="text-danger">Не удалось загрузить список. Попробуйте обновить страницу.</p>
    <p v-if="data" class="text-sm font-semibold">Всего: {{ data.total }}<span v-if="day"> · в выбранном дне: {{ groups.reduce((n, d) => n + d.people.length, 0) }}</span></p>
    <p class="text-ink-soft text-xs">При отсутствии выбранного времени указан день приглашения; ожидающие резерв отнесены к резерву. Каждый кандидат показан один раз. Анкеты и оценки сохранены.</p>
    <section v-for="d in groups" :key="d.key" class="bg-card border-line rounded-3xl border p-4 sm:p-5">
      <h2 class="font-display text-xl first-letter:uppercase">{{ title(d) }} · {{ d.people.length }}</h2>
      <p v-if="!d.people.length" class="text-ink-soft mt-3 text-sm">Таких кандидатов в этот день нет.</p>
      <ul v-else class="mt-3 divide-y divide-[var(--color-line)]"><li v-for="person in d.people" :key="person.id" class="flex flex-wrap items-center justify-between gap-2 py-3"><NuxtLink :to="`/staff/applications/${person.id}?from=all`" class="min-w-0 text-sm font-semibold hover:underline">{{ person.name }}<span class="text-ink-soft font-normal">{{ person.faculty ? ` · ${person.faculty}` : '' }}</span></NuxtLink><span class="text-danger text-xs">ЦО не пройден</span></li></ul>
    </section>
  </main>
</template>
