<script setup lang="ts">
/** Подменю админки: показываем только разделы, на которые есть право. */
const { data: nav } = await useFetch("/api/staff/nav", { key: "staff-nav" });
const route = useRoute();

const items = computed(() => {
  const can = nav.value?.can;
  if (!can) return [];
  return [
    { to: "/staff/stages", label: "Этапы", show: can.stages },
    { to: "/staff/admin/people", label: "Люди", show: can.team },
    { to: "/staff/admin/roles", label: "Роли", show: can.roles },
    { to: "/staff/admin/forms", label: "Анкета и оценка", show: can.forms },
    { to: "/staff/admin/quiz", label: "Викторина", show: can.forms },
    { to: "/staff/admin/site", label: "Сайт", show: can.content },
    { to: "/staff/admin/broadcast", label: "Рассылки", show: can.broadcast },
    { to: "/staff/admin/audit", label: "Журнал", show: can.audit },
  ].filter((item) => item.show);
});
</script>

<template>
  <nav class="bg-card border-line flex gap-1 overflow-x-auto rounded-2xl border p-1" aria-label="Разделы админки">
    <NuxtLink
      v-for="item in items"
      :key="item.to"
      :to="item.to"
      class="min-h-10 shrink-0 rounded-xl px-4 text-sm leading-10 font-medium"
      :class="route.path === item.to ? 'bg-paper' : 'text-ink-soft hover:text-ink'"
    >
      {{ item.label }}
    </NuxtLink>
  </nav>
</template>
