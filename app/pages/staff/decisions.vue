<script setup lang="ts">
import { Check, Lock, Megaphone, X } from "lucide-vue-next";

import type { FinalPart, RankRow } from "~~/lib/applications/decisions";

/**
 * «Итоги отбора»: кто проходит в Школу. Отсева между этапами нет — решение
 * одно, в конце. Рейтинг — сумма средних баллов анкеты, ДЗ, ЦО и
 * собеседования. Отметки — черновик; кандидаты увидят результат только после
 * «Опубликовать», и опубликованное уже не меняется.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Итоги отбора" });

const PART_LABEL: Record<FinalPart, string> = { APPLICATION: "Анкета", HOMEWORK: "ДЗ", ASSESSMENT: "ЦО", INTERVIEW: "Собес" };
const PART_STAGE: Record<FinalPart, string> = { APPLICATION: "", HOMEWORK: "&stage=HOMEWORK", ASSESSMENT: "", INTERVIEW: "&stage=INTERVIEW" };

const { data, refresh } = await useFetch<{ rows: RankRow[] }>("/api/staff/decisions");
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
  const result = await setOne.submit({ applicationId: row.id, outcome: next });
  if (!result.ok) await refresh();
}

const threshold = ref<number | null>(null);
const bulk = useAction("/api/staff/decisions/bulk");
async function applyThreshold() {
  if (threshold.value === null) return;
  const result = await bulk.submit({ threshold: threshold.value });
  if (result.ok) await refresh();
}

const confirming = ref(false);
const publish = useAction("/api/staff/decisions/publish");
async function doPublish() {
  const result = await publish.submit({});
  confirming.value = false;
  if (result.ok) await refresh();
}

const parts = computed(() => rows.value[0]?.parts?.map((part) => part.stage) ?? []);
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <div class="flex flex-col gap-1">
      <h1 class="font-display text-3xl">Итоги отбора</h1>
      <p class="text-ink-soft max-w-2xl text-sm">
        Отсева между этапами нет: все, кто отправил анкету, проходят ДЗ, центр оценки и собеседование. Здесь — одно
        решение в конце. Итог — сумма средних баллов этапов. Отметки — черновик: кандидаты увидят результат, только когда
        вы нажмёте «Опубликовать». Опубликованное изменить нельзя.
      </p>
    </div>

    <!-- Сводка и действия -->
    <section class="bg-card border-line grid items-center gap-4 rounded-3xl border p-4 sm:p-5 lg:grid-cols-[1fr_auto]">
      <!-- Счётчики — плитками, число и подпись по центру плитки. -->
      <dl class="grid grid-cols-2 content-center gap-2 sm:grid-cols-4">
        <div
          v-for="tile in [
            { label: 'Проходят', value: counts.passed, tone: 'text-ok' },
            { label: 'Не проходят', value: counts.rejected, tone: 'text-danger' },
            { label: 'Без решения', value: counts.none, tone: '' },
            { label: 'Опубликовано', value: counts.published, tone: '' },
          ]"
          :key="tile.label"
          class="bg-paper flex flex-col-reverse items-center justify-center gap-1 rounded-2xl px-2 py-3 text-center"
        >
          <dt class="text-ink-soft text-xs">{{ tile.label }}</dt>
          <dd class="font-display text-2xl leading-none" :class="tile.tone">{{ tile.value }}</dd>
        </div>
      </dl>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-end lg:flex-col lg:items-stretch">
        <form class="flex items-end gap-2" @submit.prevent="applyThreshold">
          <label class="flex flex-col gap-1 text-xs font-medium">
            Проходят от итога
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
      <div
        class="text-ink-soft border-line hidden gap-4 border-b px-4 py-2 text-xs font-semibold uppercase md:grid"
        :style="{ gridTemplateColumns: `40px 2fr repeat(${parts.length}, minmax(0, 0.7fr)) 1fr 220px` }"
      >
        <span>#</span><span>Кандидат</span>
        <span v-for="part in parts" :key="part" class="text-center">{{ PART_LABEL[part] }}</span>
        <span>Итог</span><span>Решение</span>
      </div>
      <ol>
        <li
          v-for="(row, index) in rows"
          :key="row.id"
          class="border-line rank-row grid grid-cols-[32px_1fr] items-center gap-x-3 gap-y-2 border-t px-4 py-3 first:border-t-0 md:gap-4"
          :style="{ '--cols': `40px 2fr repeat(${parts.length}, minmax(0, 0.7fr)) 1fr 220px` }"
        >
          <span class="text-ink-soft text-sm">{{ index + 1 }}</span>
          <NuxtLink
            :to="`/staff/applications/${row.id}?from=all`"
            class="flex min-w-0 items-center gap-3 hover:underline"
          >
            <StaffAvatar :seed="row.id" :text="row.initials" />
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold">{{ row.name }}</span>
              <span v-if="row.telegramUsername" class="text-ink-soft block truncate text-xs">@{{ row.telegramUsername }}</span>
            </span>
          </NuxtLink>
          <!-- Баллы этапов: на телефоне — строкой чипов, на компьютере — колонками. -->
          <span class="col-start-2 flex flex-wrap gap-1.5 md:contents">
            <NuxtLink
              v-for="part in row.parts ?? []"
              :key="part.stage"
              :to="`/staff/applications/${row.id}?from=all${PART_STAGE[part.stage]}`"
              class="bg-paper rounded-lg px-2 py-1 text-center text-xs hover:underline md:bg-transparent md:px-0 md:text-sm"
              :title="`${PART_LABEL[part.stage]}: ${part.average ?? 'нет оценки'} из ${part.max}`"
            >
              <span class="text-ink-soft md:hidden">{{ PART_LABEL[part.stage] }} </span>
              <b v-if="part.average !== null">{{ part.average }}</b><span v-else class="text-ink-soft">—</span>
              <span class="text-ink-soft">/{{ part.max }}</span>
            </NuxtLink>
          </span>
          <span class="col-start-2 flex flex-col gap-1 md:col-start-auto">
            <span class="text-sm"><b>{{ row.average ?? "—" }}</b><span class="text-ink-soft"> / {{ row.max }}</span></span>
            <span class="text-ink-soft text-xs">проверено {{ row.reviewed }} из {{ row.reviewers }}</span>
            <span v-if="row.markers.length" class="flex flex-wrap gap-1">
              <span v-for="marker in row.markers" :key="marker" class="bg-brand-purple-soft/60 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[#6a1a91]">{{ marker }}</span>
            </span>
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
      <p v-if="rows.length === 0" class="text-ink-soft p-8 text-center text-sm">Пока никто не отправил анкету.</p>
    </section>
  </main>
</template>

<style scoped>
@media (min-width: 48rem) {
  .rank-row {
    grid-template-columns: var(--cols);
  }
}
</style>
