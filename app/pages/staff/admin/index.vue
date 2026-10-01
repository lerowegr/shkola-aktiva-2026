<script setup lang="ts">
/** Вход в админку — сразу в первый доступный раздел. */
definePageMeta({ layout: "staff" });

const { data: nav } = await useFetch("/api/staff/nav", { key: "staff-nav" });
const can = nav.value?.can;
const sections: [boolean | undefined, string][] = [
  [can?.team, "/staff/admin/people"],
  [can?.stages, "/staff/stages"],
  [can?.roles, "/staff/admin/roles"],
  [can?.forms, "/staff/admin/forms"],
  [can?.content, "/staff/admin/site"],
  [can?.broadcast, "/staff/admin/broadcast"],
  [can?.audit, "/staff/admin/audit"],
];
await navigateTo(sections.find(([allowed]) => allowed)?.[1] ?? "/staff", { replace: true });
</script>

<template>
  <div />
</template>
