<template>
  <!-- Один корень: с несколькими Vue путается при смене страниц. -->
  <div>
    <NuxtPwaManifest />
    <AppDemoBar />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <AppUpdateBar />
  </div>
</template>
