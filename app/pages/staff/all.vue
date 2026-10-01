<script setup lang="ts">
import { Shuffle } from "lucide-vue-next";

import type { ListResult } from "~~/lib/applications/staff";

/** «Все анкеты» — чтобы сверяться, как проверяют другие. Чужие — только чтение. */
definePageMeta({ layout: "staff" });
useHead({ title: "Все анкеты" });

const user = await useSession();
const canAssign = computed(() => !!user.value && (user.value.isOwner || user.value.permissions.includes("applications.assign")));

const list = ref<{ refresh: () => Promise<void> } | null>(null);
const { data: summary, refresh: refreshSummary } = await useFetch<ListResult>("/api/staff/applications", {
  query: { scope: "all" },
  key: "staff-all-summary",
  pick: ["unassigned"],
});
const unassigned = computed(() => summary.value?.unassigned ?? 0);
const assign = useAction("/api/staff/applications/assign-all");

async function assignAll() {
  const result = await assign.submit({});
  if (result.ok) {
    await list.value?.refresh();
    await refreshSummary();
  }
}
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex flex-col gap-1">
        <h1 class="font-display text-3xl">Все анкеты</h1>
        <p class="text-ink-soft max-w-xl text-sm">
          Все анкеты и оценки по ним — посмотрите, как проверяют другие. Менять можно только свои, они отмечены полосой
          слева.
        </p>
      </div>

      <div v-if="canAssign && unassigned > 0" class="flex flex-col gap-1 sm:items-end">
        <UiButton class="sm:w-auto" :pending="assign.pending.value" @click="assignAll">
          <Shuffle class="size-4" aria-hidden="true" />
          Распределить нераспределённые ({{ unassigned }})
        </UiButton>
      </div>
    </div>

    <UiNotice :ok="assign.result.value?.ok" :message="assign.result.value?.message" />

    <StaffApplicationList ref="list" scope="all" />
  </main>
</template>
