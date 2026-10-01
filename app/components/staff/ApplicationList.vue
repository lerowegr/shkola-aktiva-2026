<script setup lang="ts">
import { refDebounced } from "@vueuse/core";
import { ChevronRight, Search } from "lucide-vue-next";

import type { EvaluatedStage, ListFilter, ListResult, ListScope } from "~~/lib/applications/staff";

/**
 * Список анкет — общий для «Моих» и «Всех». Во «Всех» добавляется колонка
 * «Проверяющий», а свои строки отмечены полосой слева.
 */
const props = withDefaults(defineProps<{ scope: ListScope; stage?: EvaluatedStage }>(), { stage: "APPLICATION" });

const search = ref("");
const q = refDebounced(search, 250);
const filter = ref<ListFilter>("all");

// Родитель перечитывает список после «Распределить». Выставляем обёртку до
// await: после него defineExpose уже не работает.
let reload: () => Promise<void> = async () => {};
defineExpose({ refresh: () => reload() });

const { data, pending, refresh } = await useFetch<ListResult>("/api/staff/applications", {
  query: { scope: props.scope, filter, q, stage: props.stage },
  key: `staff-list-${props.stage}-${props.scope}`,
});
reload = refresh;

const FILTERS: { key: ListFilter; label: string }[] = [
  { key: "all", label: "Все" },
  { key: "todo", label: "Не проверены" },
  { key: "done", label: "Проверены" },
];

const link = (id: string) =>
  `/staff/applications/${id}?from=${props.scope}${props.stage === "APPLICATION" ? "" : `&stage=${props.stage}`}`;
</script>

<template>
  <section class="bg-card border-line overflow-hidden rounded-3xl border">
    <div class="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <label class="relative flex-1 sm:max-w-xs">
        <span class="sr-only">Поиск</span>
        <Search class="text-ink-soft absolute top-1/2 left-3.5 size-4 -translate-y-1/2" aria-hidden="true" />
        <input
          v-model="search"
          type="search"
          placeholder="ФИО, студбилет или Telegram"
          class="border-line bg-paper focus:border-accent focus:ring-accent/20 min-h-11 w-full rounded-2xl border pr-3 pl-10 text-sm outline-none focus:ring-4"
        >
      </label>

      <div role="tablist" class="bg-paper grid grid-cols-3 gap-1 rounded-2xl p-1 sm:flex">
        <button
          v-for="item in FILTERS"
          :key="item.key"
          type="button"
          role="tab"
          :aria-selected="filter === item.key"
          class="flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[13px] leading-tight font-medium transition sm:min-h-9 sm:shrink-0 sm:flex-row sm:gap-1.5 sm:px-3 sm:py-0 sm:text-sm"
          :class="filter === item.key ? 'bg-card shadow-sm' : 'text-ink-soft hover:text-ink'"
          @click="filter = item.key"
        >
          <span class="whitespace-nowrap">{{ item.label }}</span>
          <span class="bg-line/80 rounded-full px-1.5 text-xs">{{ data?.counts[item.key] ?? 0 }}</span>
        </button>
      </div>
    </div>

    <!-- Шапка таблицы — только на широком экране -->
    <div
      class="text-ink-soft border-line hidden border-y px-4 py-2 text-xs font-semibold tracking-wide uppercase md:grid"
      :class="scope === 'all' ? 'grid-cols-[2fr_1.3fr_1.4fr_1fr_24px]' : 'grid-cols-[2fr_1.6fr_1fr_24px]'"
    >
      <span>Кандидат</span>
      <span v-if="scope === 'all'">Проверяющий</span>
      <span>Баллы</span>
      <span>Оценка</span>
      <span />
    </div>

    <ul :aria-busy="pending">
      <li v-for="row in data?.rows ?? []" :key="row.id" class="border-line border-t first:border-t-0 md:first:border-t-0">
        <NuxtLink
          :to="link(row.id)"
          class="hover:bg-paper relative grid items-center gap-x-3 gap-y-2 px-4 py-3 transition md:gap-4"
          :class="
            scope === 'all'
              ? 'grid-cols-[1fr_auto] md:grid-cols-[2fr_1.3fr_1.4fr_1fr_24px]'
              : 'grid-cols-[1fr_auto] md:grid-cols-[2fr_1.6fr_1fr_24px]'
          "
        >
          <span v-if="row.mine" class="bg-brand-green absolute inset-y-0 left-0 w-1" aria-hidden="true" />

          <span class="flex min-w-0 items-center gap-3">
            <StaffAvatar :seed="row.id" :text="row.initials" />
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold">{{ row.name }}</span>
              <span v-if="row.telegramUsername" class="text-ink-soft block truncate text-xs">@{{ row.telegramUsername }}</span>
            </span>
          </span>

          <!-- На телефоне статус справа от имени -->
          <span class="md:hidden"><StaffStatusPill :status="row.summary.status" /></span>

          <span v-if="scope === 'all'" class="col-span-2 flex items-center gap-2 text-sm md:col-span-1">
            <template v-if="row.reviewers.length">
              <span class="text-ink-soft md:hidden">Проверяет:</span>
              <span class="truncate">{{ row.reviewers.map((r) => r.name).join(", ") }}</span>
              <span v-if="row.mine" class="bg-brand-green-soft rounded-md px-1.5 text-xs font-semibold">вы</span>
            </template>
            <span v-else class="text-danger">Не распределена</span>
          </span>

          <span class="col-span-2 flex flex-col gap-1.5 md:col-span-1">
            <span class="text-sm">
              <b>{{ row.summary.total ?? "—" }}</b><span class="text-ink-soft">/ {{ row.summary.max }}</span>
            </span>
            <span v-if="row.markers.length" class="flex flex-wrap gap-1">
              <span
                v-for="marker in row.markers"
                :key="marker"
                class="bg-brand-purple-soft/60 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[#6a1a91]"
              >
                {{ marker }}
              </span>
            </span>
          </span>

          <span class="hidden md:block"><StaffStatusPill :status="row.summary.status" /></span>
          <ChevronRight class="text-ink-soft hidden size-4 md:block" aria-hidden="true" />
        </NuxtLink>
      </li>
    </ul>

    <p v-if="data && data.rows.length === 0" class="text-ink-soft px-4 py-10 text-center text-sm">
      {{
        search
          ? "Никого не нашли. Проверьте написание."
          : filter === "todo"
            ? "Всё проверено 🎉"
            : stage === "HOMEWORK"
              ? "Работ пока нет."
              : "Анкет пока нет."
      }}
    </p>
  </section>
</template>
