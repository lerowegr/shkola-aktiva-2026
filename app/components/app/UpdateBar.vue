<script setup lang="ts">
import { RefreshCw, X } from "lucide-vue-next";

/**
 * «Вышло обновление» внизу экрана. Предложение, а не приказ: обновление
 * перезагрузит страницу, а человек может стоять посреди анкеты.
 * Внутри Telegram молчим: мини-приложение и так открывается заново
 * по десять раз в день.
 */
const { $pwa } = useNuxtApp();
const hidden = ref(false);
const inTg = ref(false);
onMounted(() => (inTg.value = inTelegram()));

const show = computed(() => !inTg.value && !hidden.value && Boolean($pwa?.needRefresh));
const updating = ref(false);

async function update() {
  updating.value = true;
  await $pwa?.updateServiceWorker(true);
}
</script>

<template>
  <div
    v-if="show"
    class="bg-ink text-paper fixed inset-x-3 bottom-3 z-50 flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl sm:right-auto sm:left-1/2 sm:w-96 sm:-translate-x-1/2"
    role="status"
  >
    <p class="flex-1 text-sm">Вышло обновление сайта.</p>
    <button type="button" class="bg-accent flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold" :disabled="updating" @click="update">
      <RefreshCw class="size-4" :class="updating && 'animate-spin'" aria-hidden="true" /> Обновить
    </button>
    <button type="button" class="text-paper/60 hover:text-paper" aria-label="Закрыть" @click="hidden = true">
      <X class="size-4" aria-hidden="true" />
    </button>
  </div>
</template>
