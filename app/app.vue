<script setup lang="ts">
const route = useRoute();
const staffPageTransition = { name: "staff-page", mode: "out-in" as const };
const isStaffPage = computed(() => route.path.startsWith("/staff"));
</script>

<template>
  <!-- Один корень: с несколькими Vue путается при смене страниц. -->
  <div>
    <NuxtPwaManifest />
    <AppDemoBar />
    <NuxtLayout>
      <NuxtPage :transition="isStaffPage ? staffPageTransition : false" />
    </NuxtLayout>
    <AppUpdateBar />
  </div>
</template>
