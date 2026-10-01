<script setup lang="ts">
import type { AuditRow } from "~~/lib/admin/audit";

/** Журнал действий: кто, что и когда. Свежие сверху, подгрузка страницами. */
definePageMeta({ layout: "staff" });
useHead({ title: "Журнал" });

const GROUPS = [
  { key: "", label: "Всё" },
  { key: "review", label: "Оценки" },
  { key: "decision", label: "Решения" },
  { key: "application", label: "Анкеты" },
  { key: "stage", label: "Этапы" },
  { key: "interview", label: "Собеседования" },
  { key: "role", label: "Роли" },
  { key: "user", label: "Доступ" },
  { key: "invite", label: "Приглашения" },
  { key: "form", label: "Анкета и оценка" },
  { key: "broadcast", label: "Рассылки" },
  { key: "auth", label: "Входы" },
];

// На сервере обычный $fetch идёт без куки посетителя — и получает отказ.
// useRequestFetch передаёт куку при серверной отрисовке, в браузере это тот же $fetch.
const request = useRequestFetch();

const group = ref("");
const rows = ref<AuditRow[]>([]);
const more = ref(false);
const loading = ref(false);

async function load(reset: boolean) {
  loading.value = true;
  const last = rows.value.at(-1);
  const result = await request<{ rows: AuditRow[]; more: boolean }>("/api/admin/audit", {
    query: { group: group.value || undefined, before: reset || !last ? undefined : new Date(last.createdAt).toISOString() },
  });
  rows.value = reset ? result.rows : [...rows.value, ...result.rows];
  more.value = result.more;
  loading.value = false;
}

await load(true);
watch(group, () => load(true));

/** Подробности одной строкой — то, что в meta похоже на смысл. */
function details(row: AuditRow): string {
  const meta = (row.meta ?? {}) as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof meta.criterion === "string") parts.push(`${meta.criterion}: ${meta.from ?? "—"} → ${meta.to ?? "—"}`);
  if (typeof meta.label === "string") parts.push(String(meta.label));
  if (typeof meta.title === "string") parts.push(String(meta.title));
  if (typeof meta.name === "string") parts.push(String(meta.name));
  if (typeof meta.outcome === "string") parts.push(meta.outcome === "PASSED" ? "проходит" : "не проходит");
  if (meta.direction === -1 || meta.direction === 1) parts.push(meta.direction === -1 ? "выше" : "ниже");
  if (typeof meta.count === "number") parts.push(`${meta.count} шт.`);
  if (typeof meta.reviewer === "string") parts.push(`→ ${meta.reviewer}`);
  return parts.join(" · ");
}
</script>

<template>
  <main class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
    <StaffAdminNav />
    <div class="flex flex-col gap-1">
      <h1 class="font-display text-3xl">Журнал действий</h1>
      <p class="text-ink-soft text-sm">Всё, что меняли организаторы, и входы. Записи не удаляются и не правятся.</p>
    </div>

    <div class="flex flex-wrap gap-1.5">
      <button
        v-for="item in GROUPS"
        :key="item.key"
        type="button"
        class="rounded-full border px-3 py-1.5 text-sm"
        :class="group === item.key ? 'border-ink bg-ink text-paper' : 'border-line bg-card text-ink-soft hover:text-ink'"
        @click="group = item.key"
      >
        {{ item.label }}
      </button>
    </div>

    <ul class="bg-card border-line overflow-hidden rounded-3xl border">
      <li
        v-for="row in rows"
        :key="row.id"
        class="border-line grid gap-1 border-t px-4 py-3 first:border-t-0 sm:grid-cols-[140px_1fr_180px] sm:gap-4"
      >
        <span class="text-ink-soft text-xs sm:text-sm">{{ mskFormat(row.createdAt, "d MMM, HH:mm:ss") }}</span>
        <span class="min-w-0">
          <span class="block text-sm font-medium">
            {{ row.label }}<template v-if="row.subject"> — {{ row.subject }}</template>
          </span>
          <span v-if="details(row)" class="text-ink-soft block truncate text-xs">{{ details(row) }}</span>
        </span>
        <span class="text-ink-soft truncate text-sm sm:text-right">{{ row.actor ?? "система" }}</span>
      </li>
    </ul>
    <p v-if="rows.length === 0 && !loading" class="text-ink-soft text-center text-sm">Записей нет.</p>
    <UiButton v-if="more" variant="ghost" :pending="loading" @click="load(false)">Показать ещё</UiButton>
  </main>
</template>
