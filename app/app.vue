<template>
  <!-- Один корень: с несколькими Vue путается при смене страниц. -->
  <div>
    <NuxtPwaManifest />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <AppUpdateBar />
  </div>
</template>
