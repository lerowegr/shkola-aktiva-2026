<script setup lang="ts">
import { ChevronLeft } from "lucide-vue-next";

import type { ChatMessage } from "~~/lib/messages/threads";

/**
 * Одна переписка. Компонент пересоздаётся на каждую ветку (key = id):
 * так у каждой ветки свой запрос, свой опрос и своё поле ввода — без
 * ручной возни с перезапросом при смене выбранной.
 */
interface ThreadDetail {
  id: string;
  name: string;
  telegramUsername: string | null;
  hasTelegram: boolean;
  application: { id: string; status: "DRAFT" | "SUBMITTED" } | null;
  messages: ChatMessage[];
}

const props = defineProps<{ id: string }>();

function initialsOf(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}
const emit = defineEmits<{ back: []; read: [] }>();

// Без await: компонент появляется после первой отрисовки страницы, и
// асинхронный setup здесь зависал бы в Suspense. На сервере запрос всё
// равно дожидаются (onServerPrefetch внутри useFetch).
const { data: thread, refresh } = useFetch<ThreadDetail>(`/api/staff/messages/${props.id}`, {
  key: `staff-thread-${props.id}`,
});

// Открыли — прочитали: родитель пересчитает список и счётчик во вкладке.
onMounted(() => {
  emit("read");
  void refreshNuxtData("inbox");
});

const chat = ref<{ clear: () => void } | null>(null);
const send = useAction("/api/staff/messages/send");
async function onSend(text: string) {
  const result = await send.submit({ threadId: props.id, text });
  if (result.ok) {
    chat.value?.clear();
    await refresh();
    emit("read");
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => (timer = setInterval(() => void refresh(), 10_000)));
onBeforeUnmount(() => timer && clearInterval(timer));
</script>

<template>
  <template v-if="thread">
    <header class="border-line flex items-center gap-3 border-b px-4 py-3">
      <button
        type="button"
        class="hover:bg-paper -ml-2 grid size-9 place-items-center rounded-xl md:hidden"
        aria-label="К списку"
        @click="emit('back')"
      >
        <ChevronLeft class="size-5" aria-hidden="true" />
      </button>
      <StaffAvatar :seed="thread.id" :text="initialsOf(thread.name)" />
      <div class="min-w-0 flex-1">
        <p class="truncate font-semibold">{{ thread.name }}</p>
        <p class="text-ink-soft truncate text-xs">
          <template v-if="thread.telegramUsername">@{{ thread.telegramUsername }} · </template>
          <NuxtLink
            v-if="thread.application?.status === 'SUBMITTED'"
            :to="`/staff/applications/${thread.application.id}?from=all`"
            class="text-accent hover:underline"
          >
            открыть анкету
          </NuxtLink>
          <template v-else>{{ thread.application ? "анкета: черновик" : "без анкеты" }}</template>
        </p>
      </div>
    </header>
    <AppChat
      ref="chat"
      side="staff"
      :messages="thread.messages"
      placeholder="Сообщение кандидату"
      :pending="send.pending.value"
      :error="send.result.value?.ok === false ? send.result.value.message : null"
      :hint="thread.hasTelegram ? 'Придёт кандидату от бота с подписью «Организаторы ША».' : 'Telegram не привязан — кандидат увидит ответ на сайте.'"
      @send="onSend"
    />
  </template>
  <p v-else class="text-ink-soft m-auto p-6 text-sm">Загружаем переписку…</p>
</template>
