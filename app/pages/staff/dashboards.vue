<script setup lang="ts">
import { RefreshCw, TriangleAlert } from "lucide-vue-next";

import type { EvaluatedStage } from "~~/lib/applications/staff";

/**
 * «Дашборды»: как идёт набор. Воронка и заявки по дням — для решений
 * «продлить ли регистрацию», проверка по мастерам — кому помочь и кто
 * оценивает заметно строже или мягче остальных.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Дашборды" });

const { data, status, refresh } = await useFetch("/api/staff/dashboards");
const updatedAt = ref(new Date());
async function reload() {
  await refresh();
  updatedAt.value = new Date();
}

const step = (key: string) => data.value?.funnel.find((item) => item.key === key)?.count ?? 0;

const funnelRows = computed(() => {
  const steps = data.value?.funnel ?? [];
  const first = steps[0]?.count ?? 0;
  return steps.map((item, i) => {
    const previous = steps[i - 1];
    return {
      label: item.label,
      value: item.count,
      share: i ? percentOf(item.count, first) : undefined,
      hint: previous ? `${percentOf(item.count, previous.count)} от шага «${previous.label}»` : undefined,
    };
  });
});

const days = computed(() => data.value?.daily ?? []);
const weekRegistered = computed(() => days.value.slice(-7).reduce((sum, day) => sum + day.registered, 0));
const dailySeries = computed(() => [
  { name: "Новые входы", color: "var(--color-brand-blue)", values: days.value.map((day) => day.registered) },
  { name: "Отправленные анкеты", color: "var(--color-brand-orange)", values: days.value.map((day) => day.submitted) },
]);

const STAGES: { key: EvaluatedStage; label: string }[] = [
  { key: "APPLICATION", label: "Анкета" },
  { key: "HOMEWORK", label: "Домашнее задание" },
  { key: "INTERVIEW", label: "Собеседование" },
];
const stage = ref<EvaluatedStage>("APPLICATION");
const stats = computed(() => data.value?.stages[stage.value]);
const progress = (key: EvaluatedStage) => {
  const reviewers = data.value?.stages[key].reviewers ?? [];
  return {
    done: reviewers.reduce((sum, row) => sum + row.done, 0),
    assigned: reviewers.reduce((sum, row) => sum + row.assigned, 0),
  };
};
const applicationProgress = computed(() => progress("APPLICATION"));

const submitted = computed(() => step("submitted"));
const channels = computed(() => data.value?.channels);
const CHANNEL_LABELS = { TELEGRAM: "Telegram", PUSH: "Пуши" } as const;
const DELIVERY_STATUSES = [
  { key: "sent", label: "Ушло" },
  { key: "skipped", label: "Пропущено" },
  { key: "failed", label: "Не дошло" },
  { key: "pending", label: "В очереди" },
] as const;

function time(date: Date) {
  return mskTime(date);
}
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h1 class="font-display text-3xl">Дашборды</h1>
        <p class="text-ink-soft text-sm">Как идёт набор в этом сезоне. Обновлено в {{ time(updatedAt) }}.</p>
      </div>
      <button
        type="button"
        class="border-line bg-card hover:border-ink-soft inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
        :disabled="status === 'pending'"
        @click="reload"
      >
        <RefreshCw class="size-4" :class="{ 'animate-spin': status === 'pending' }" aria-hidden="true" />
        Обновить
      </button>
    </div>

    <div v-if="data" class="flex flex-col gap-6 transition-opacity" :class="{ 'opacity-60': status === 'pending' }">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <DashStat
          label="Вошли на сайт"
          :value="formatCount(step('registered'))"
          :note="weekRegistered ? `+${formatCount(weekRegistered)} за 7 дней` : 'за 7 дней — никого'"
          :good="weekRegistered > 0"
        />
        <DashStat
          label="Отправили анкету"
          :value="formatCount(submitted)"
          :note="`из ${formatCount(step('started'))} начавших`"
        />
        <DashStat
          label="Проверено анкет"
          :value="percentOf(applicationProgress.done, applicationProgress.assigned)"
          :note="`${formatCount(applicationProgress.done)} из ${formatCount(applicationProgress.assigned)} оценок`"
        />
        <DashStat
          label="Прошли отбор"
          :value="formatCount(step('accepted'))"
          :note="step('accepted') ? 'итоги опубликованы' : 'итогов ещё нет'"
        />
      </div>

      <div class="grid gap-6 lg:grid-cols-2">
        <DashCard title="Воронка отбора" hint="Сколько людей дошло до каждого шага; доля — от вошедших на сайт.">
          <DashBarList :rows="funnelRows" />
        </DashCard>

        <DashCard title="Заявки по дням" hint="За последние 30 дней, по московскому времени.">
          <DashLineChart
            :labels="days.map((day) => shortDay(day.day))"
            :series="dailySeries"
            caption="Новые входы и отправленные анкеты по дням за 30 дней"
          />
        </DashCard>
      </div>

      <DashCard title="Проверка" hint="Сколько проверил каждый мастер и как его средний итог отличается от общего.">
        <!-- Вкладки этапов переносятся на новую строку, а не прячутся за прокруткой. -->
        <div role="tablist" class="bg-paper border-line flex max-w-full flex-wrap gap-1 self-start rounded-2xl border p-1">
          <button
            v-for="item in STAGES"
            :id="`stage-tab-${item.key}`"
            :key="item.key"
            type="button"
            aria-controls="stage-review-panel"
            role="tab"
            :aria-selected="stage === item.key"
            class="rounded-xl px-3 py-1.5 text-sm whitespace-nowrap"
            :class="stage === item.key ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'"
            @click="stage = item.key"
          >
            {{ item.label }}
            <span class="tabular-nums opacity-70">{{ progress(item.key).done }}/{{ progress(item.key).assigned }}</span>
          </button>
        </div>

        <Transition name="dash-stage" mode="out-in">
          <div
            id="stage-review-panel"
            :key="stage"
            role="tabpanel"
            :aria-labelledby="`stage-tab-${stage}`"
            class="min-h-16"
          >
            <p v-if="!stats?.reviewers.length" class="text-ink-soft text-sm">На этом этапе работы ещё не назначены.</p>
            <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <DashReviewers :reviewers="stats.reviewers" :overall="stats.overall" :max="stats.max" />
              <div class="flex min-w-0 flex-col gap-2">
                <h3 class="text-sm font-medium">Итоговые баллы проверенных работ</h3>
                <p v-if="!stats.histogram.some(Boolean)" class="text-ink-soft text-sm">
                  Пока ни одной полностью проверенной работы.
                </p>
                <DashHistogram
                  v-else
                  :counts="stats.histogram"
                  :mean="stats.overall"
                  :caption="`Распределение итоговых баллов, этап «${STAGES.find((item) => item.key === stage)?.label}»`"
                />
              </div>
            </div>
          </div>
        </Transition>
      </DashCard>

      <div class="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <DashCard
          v-for="cut in data.breakdowns"
          :key="cut.question"
          :title="cut.question"
          :hint="`По отправленным анкетам; доля — от ${formatCount(submitted)}.`"
        >
          <p v-if="!submitted" class="text-ink-soft text-sm">Пока нет отправленных анкет.</p>
          <DashBarList
            v-else
            :rows="cut.rows.map((row) => ({ label: row.label, value: row.count, share: percentOf(row.count, submitted) }))"
          />
        </DashCard>
      </div>

      <DashCard
        v-if="channels"
        title="Вовлечённость и каналы"
        hint="Сколько кандидатов коротают ожидание в играх и куда им доходят новости. «Пропущено» — чаще всего уже прочитали на сайте, и дублировать не стали."
      >
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div class="flex flex-col gap-1">
            <p class="text-ink-soft text-sm">Играли в мини-игры</p>
            <p class="text-2xl font-semibold">{{ formatCount(data.games.players) }}</p>
            <p class="text-ink-soft text-sm">
              {{ formatCount(data.games.plays) }} {{ plural(data.games.plays, ["партия", "партии", "партий"]) }}
            </p>
          </div>
          <div class="flex flex-col gap-1">
            <p class="text-ink-soft text-sm">Привязали Telegram</p>
            <p class="text-2xl font-semibold">{{ formatCount(channels.telegram) }}</p>
            <p class="text-ink-soft text-sm">{{ percentOf(channels.telegram, channels.candidates) }} кандидатов</p>
          </div>
          <div class="flex flex-col gap-1">
            <p class="text-ink-soft text-sm">Включили пуши</p>
            <p class="text-2xl font-semibold">{{ formatCount(channels.push) }}</p>
            <p class="text-ink-soft text-sm">{{ percentOf(channels.push, channels.candidates) }} кандидатов</p>
          </div>
        </div>
        <div class="border-line overflow-x-auto rounded-xl border">
          <table class="w-full text-sm tabular-nums">
            <thead class="bg-paper text-ink-soft text-left">
              <tr>
                <th class="px-3 py-2 font-normal">Доставки</th>
                <th v-for="row in channels.deliveries" :key="row.channel" class="px-3 py-2 text-right font-normal">
                  {{ CHANNEL_LABELS[row.channel] }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="kind in DELIVERY_STATUSES" :key="kind.key" class="border-line border-t">
                <td class="px-3 py-2">{{ kind.label }}</td>
                <td
                  v-for="row in channels.deliveries"
                  :key="row.channel"
                  class="px-3 py-2 text-right"
                  :class="{ 'text-danger font-semibold': kind.key === 'failed' && row.failed }"
                >
                  <span class="inline-flex items-center gap-1">
                    <TriangleAlert v-if="kind.key === 'failed' && row.failed" class="size-3.5" aria-hidden="true" />
                    {{ formatCount(row[kind.key]) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DashCard>
    </div>
  </main>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .dash-stage-enter-active,
  .dash-stage-leave-active {
    transition:
      opacity 0.16s ease,
      transform 0.16s cubic-bezier(0.2, 0, 0, 1);
  }
  .dash-stage-enter-from {
    opacity: 0;
    transform: translateY(6px);
  }
  .dash-stage-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
