<script setup lang="ts">
import { FileText } from "lucide-vue-next";

import { PARENT_CONSENT, PARTICIPATION_INVITATION, PARTICIPATION_PATH } from "~~/lib/participation/form";
</script>

<template>
  <section class="border-line bg-card grid gap-3 rounded-2xl border p-4">
    <h2 class="text-ink-soft text-sm font-semibold">Пример приглашения в Telegram</h2>
    <div class="bg-paper grid gap-3 rounded-xl p-4">
      <p class="font-semibold">{{ PARTICIPATION_INVITATION.title }}</p>
      <p class="text-sm whitespace-pre-line">{{ PARTICIPATION_INVITATION.body }}</p>
      <a :href="PARENT_CONSENT.path" :download="PARENT_CONSENT.filename" class="text-accent flex items-start gap-2 text-sm font-medium hover:underline">
        <FileText class="size-5 shrink-0" aria-hidden="true" />
        <span>{{ PARENT_CONSENT.filename }}</span>
      </a>
      <p class="text-ink-soft text-sm">{{ PARENT_CONSENT.caption }}</p>
    </div>
    <NuxtLink :to="PARTICIPATION_PATH" class="bg-accent text-accent-ink inline-flex min-h-12 items-center justify-center rounded-xl px-4 font-semibold">
      Открыть анкету
    </NuxtLink>
  </section>
</template>
