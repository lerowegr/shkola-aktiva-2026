<script setup lang="ts">
import { RotateCcw, Users } from "lucide-vue-next";

import type { ActionResult } from "~/composables/useAction";

/**
 * Демо-копия: полоса сверху на каждой странице — что это не настоящий
 * отбор, переход ко входу «как…» и сброс демо к исходному состоянию.
 */
const demo = useRuntimeConfig().public.demo === true;
const pending = ref(false);

async function reset() {
  if (!window.confirm("Вернуть демо в исходное состояние? Всё, что вы накликали, пропадёт.")) return;
  pending.value = true;
  try {
    await $fetch<ActionResult>("/api/demo/reset", { method: "POST", body: {}, ignoreResponseError: true });
    await $fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div v-if="demo" class="bg-brand-yellow text-ink relative z-50 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2 text-sm">
    <span class="font-semibold">Демо-версия: люди и данные выдуманы, уведомления никуда не уходят.</span>
    <span class="flex gap-3">
      <a href="/login" class="flex items-center gap-1 underline-offset-2 hover:underline"><Users class="size-4" aria-hidden="true" /> Войти как…</a>
      <button type="button" class="flex items-center gap-1 underline-offset-2 hover:underline disabled:opacity-50" :disabled="pending" @click="reset">
        <RotateCcw class="size-4" aria-hidden="true" /> {{ pending ? "Сбрасываем…" : "Сбросить демо" }}
      </button>
    </span>
  </div>
</template>
