<script setup lang="ts">
import { Check, Lock, Megaphone, X } from "lucide-vue-next";

import type { RankRow } from "~~/lib/applications/decisions";
import type { EvaluatedStage } from "~~/lib/applications/staff";

/**
 * «Решения»: кто проходит дальше. Рейтинг — по среднему итогу мастеров.
 * Отметки — черновик; кандидаты увидят результат только после
 * «Опубликовать», и опубликованное уже не меняется.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Решения" });

const route = useRoute();
const router = useRouter();
const STAGES: { key: EvaluatedStage; label: string }[] = [
  { key: "APPLICATION", label: "Анкета" },
  { key: "HOMEWORK", label: "Домашнее задание" },
  { key: "INTERVIEW", label: "Собеседование" },
];
const stage = computed<EvaluatedStage>(() =>
  STAGES.some((item) => item.key === route.query.stage) ? (route.query.stage as EvaluatedStage) : "APPLICATION",
);

const { data, refresh } = await useFetch<{ rows: RankRow[] }>("/api/staff/decisions", { query: { stage } });
const rows = computed(() => data.value?.rows ?? []);

const counts = computed(() => ({
  passed: rows.value.filter((row) => row.decision === "PASSED").length,
  rejected: rows.value.filter((row) => row.decision === "REJECTED").length,
  none: rows.value.filter((row) => !row.decision).length,
  unpublished: rows.value.filter((row) => row.decision && !row.published).length,
  published: rows.value.filter((row) => row.published).length,
}));

const setOne = useAction("/api/staff/decisions/set");
async function decide(row: RankRow, outcome: "PASSED" | "REJECTED") {
  if (row.published) return;
  const next = row.decision === outcome ? null : outcome;
  row.decision = next;
  const result = await setOne.submit({ applicationId: row.id, stage: stage.value, outcome: next });
  if (!result.ok) await refresh();
}

const threshold = ref<number | null>(null);
const bulk = useAction("/api/staff/decisions/bulk");
async function applyThreshold() {
  if (threshold.value === null) return;
  const result = await bulk.submit({ stage: stage.value, threshold: threshold.value });
  if (result.ok) await refresh();
}

const confirming = ref(false);
const publish = useAction("/api/staff/decisions/publish");
async function doPublish() {
  const result = await publish.submit({ stage: stage.value });
  confirming.value = false;
  if (result.ok) await refresh();
}

watch(stage, () => {
  confirming.value = false;
  threshold.value = null;
  bulk.result.value = null;
  publish.result.value = null;
});
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <div class="flex flex-col gap-1">
      <h1 class="font-display text-3xl">Решения</h1>
      <p class="text-ink-soft max-w-2xl text-sm">
        Кто проходит на следующий этап. Отметки — черновик: кандидаты увидят результат, только когда вы нажмёте
        «Опубликовать». Опубликованное изменить нельзя.
      </p>
    </div>

    <div role="tablist" class="bg-card border-line flex max-w-full gap-1 self-start overflow-x-auto rounded-2xl border p-1">
      <button
        v-for="item in STAGES"
        :key="item.key"
        type="button"
        role="tab"
        :aria-selected="stage === item.key"
        class="min-h-10 shrink-0 rounded-xl px-4 text-sm font-medium"
        :class="stage === item.key ? 'bg-paper' : 'text-ink-soft'"
        @click="router.replace({ query: { stage: item.key } })"
      >
        {{ item.label }}
      </button>
    </div>

    <!-- Сводка и действия -->
    <section class="bg-card border-line grid gap-4 rounded-3xl border p-5 lg:grid-cols-[1fr_auto]">
      <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><dt class="text-ink-soft text-xs">Проходят</dt><dd class="font-display text-ok text-2xl">{{ counts.passed }}</dd></div>
        <div><dt class="text-ink-soft text-xs">Не проходят</dt><dd class="font-display text-danger text-2xl">{{ counts.rejected }}</dd></div>
        <div><dt class="text-ink-soft text-xs">Без решения</dt><dd class="font-display text-2xl">{{ counts.none }}</dd></div>
        <div><dt class="text-ink-soft text-xs">Опубликовано</dt><dd class="font-display text-2xl">{{ counts.published }}</dd></div>
      </dl>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-end lg:flex-col lg:items-stretch">
        <form class="flex items-end gap-2" @submit.prevent="applyThreshold">
          <label class="flex flex-col gap-1 text-xs font-medium">
            Проходят от балла
            <input
              v-model.number="threshold"
              type="number"
              min="0"
              step="0.5"
              inputmode="decimal"
              class="border-line bg-paper min-h-11 w-28 rounded-xl border px-3 text-base"
            >
          </label>
          <UiButton type="submit" variant="ghost" class="min-h-11 w-auto px-4 text-sm" :pending="bulk.pending.value" :disabled="threshold === null">
            Применить
          </UiButton>
        </form>

        <template v-if="confirming">
          <p class="text-sm">Опубликовать {{ counts.unpublished }} решений? Кандидаты сразу получат уведомления.</p>
          <div class="flex gap-2">
            <UiButton variant="ghost" class="min-h-11 text-sm" @click="confirming = false">Отмена</UiButton>
            <UiButton class="min-h-11 text-sm" :pending="publish.pending.value" @click="doPublish">Опубликовать</UiButton>
          </div>
        </template>
        <UiButton v-else class="min-h-11 text-sm" :disabled="counts.unpublished === 0" @click="confirming = true">
          <Megaphone class="size-4" aria-hidden="true" /> Опубликовать результаты ({{ counts.unpublished }})
        </UiButton>
      </div>
    </section>

    <UiNotice v-if="bulk.result.value" :ok="bulk.result.value.ok" :message="bulk.result.value.message" />
    <UiNotice v-if="publish.result.value" :ok="publish.result.value.ok" :message="publish.result.value.message" />

    <!-- Рейтинг -->
    <section class="bg-card border-line overflow-hidden rounded-3xl border">
      <div class="text-ink-soft border-line hidden grid-cols-[40px_2fr_1.2fr_0.8fr_220px] gap-4 border-b px-4 py-2 text-xs font-semibold uppercase md:grid">
        <span>#</span><span>Кандидат</span><span>Средний балл</span><span>Проверено</span><span>Решение</span>
      </div>
      <ol>
        <li
          v-for="(row, index) in rows"
          :key="row.id"
          class="border-line grid grid-cols-[32px_1fr] items-center gap-x-3 gap-y-2 border-t px-4 py-3 first:border-t-0 md:grid-cols-[40px_2fr_1.2fr_0.8fr_220px] md:gap-4"
        >
          <span class="text-ink-soft text-sm">{{ index + 1 }}</span>
          <NuxtLink
            :to="`/staff/applications/${row.id}?from=all${stage === 'APPLICATION' ? '' : `&stage=${stage}`}`"
            class="flex min-w-0 items-center gap-3 hover:underline"
          >
            <StaffAvatar :seed="row.id" :text="row.initials" />
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold">{{ row.name }}</span>
              <span v-if="row.telegramUsername" class="text-ink-soft block truncate text-xs">@{{ row.telegramUsername }}</span>
            </span>
          </NuxtLink>
          <span class="col-start-2 flex flex-col gap-1 md:col-start-auto">
            <span class="text-sm"><b>{{ row.average ?? "—" }}</b><span class="text-ink-soft">/ {{ row.max }}</span></span>
            <span v-if="row.markers.length" class="flex flex-wrap gap-1">
              <span v-for="marker in row.markers" :key="marker" class="bg-brand-purple-soft/60 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[#6a1a91]">{{ marker }}</span>
            </span>
          </span>
          <span class="text-ink-soft col-start-2 text-sm md:col-start-auto">
            {{ row.reviewed }} из {{ row.reviewers }}
          </span>
          <div class="col-start-2 flex items-center gap-1.5 md:col-start-auto">
            <template v-if="row.published">
              <span
                class="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
                :class="row.decision === 'PASSED' ? 'bg-brand-green-soft text-ok' : 'bg-brand-red-soft text-danger'"
              >
                <Lock class="size-3.5" aria-hidden="true" />
                {{ row.decision === "PASSED" ? "Проходит" : "Не проходит" }}
              </span>
            </template>
            <template v-else>
              <button
                type="button"
                :aria-pressed="row.decision === 'PASSED'"
                class="flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl border text-sm font-medium transition"
                :class="row.decision === 'PASSED' ? 'border-ok bg-brand-green-soft text-ok' : 'border-line hover:border-ok/50'"
                @click="decide(row, 'PASSED')"
              >
                <Check class="size-4" aria-hidden="true" /> Проходит
              </button>
              <button
                type="button"
                :aria-pressed="row.decision === 'REJECTED'"
                class="flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl border text-sm font-medium transition"
                :class="row.decision === 'REJECTED' ? 'border-danger bg-brand-red-soft text-danger' : 'border-line hover:border-danger/50'"
                @click="decide(row, 'REJECTED')"
              >
                <X class="size-4" aria-hidden="true" /> Нет
              </button>
            </template>
          </div>
        </li>
      </ol>
      <p v-if="rows.length === 0" class="text-ink-soft p-8 text-center text-sm">На этом этапе пока некого оценивать.</p>
    </section>
  </main>
</template>
