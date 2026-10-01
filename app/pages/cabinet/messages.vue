<script setup lang="ts">
import type { ChatMessage } from "~~/lib/messages/threads";

/** Переписка кандидата с организаторами. То же, что пишут боту. */
useHead({ title: "Сообщения" });

const { data, refresh } = await useFetch<{ messages: ChatMessage[]; telegram: boolean }>("/api/cabinet/messages");

// Сервер отметил уведомления о переписке прочитанными — обновим колокольчик.
onMounted(() => void refreshNuxtData("inbox"));

const chat = ref<{ clear: () => void } | null>(null);
const send = useAction("/api/cabinet/messages/send");

async function onSend(text: string) {
  const result = await send.submit({ text });
  if (result.ok) {
    chat.value?.clear();
    await refresh();
  }
}

// Пока страница открыта, подтягиваем ответы раз в 10 секунд.
let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => (timer = setInterval(() => void refresh(), 10_000)));
onBeforeUnmount(() => timer && clearInterval(timer));
</script>

<template>
  <div class="flex h-dvh flex-col">
    <AppHeader />
    <main class="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-4 px-4 pt-6 pb-4">
      <div class="flex flex-col gap-1">
        <NuxtLink to="/cabinet" class="text-ink-soft hover:text-ink text-sm">← Кабинет</NuxtLink>
        <h1 class="font-display text-3xl">Сообщения</h1>
        <p class="text-ink-soft text-sm">
          Вопрос организаторам — сюда или боту в Telegram, это одна и та же переписка.
        </p>
      </div>

      <section class="bg-card border-line flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border">
        <AppChat
          ref="chat"
          side="candidate"
          :messages="data?.messages ?? []"
          placeholder="Сообщение организаторам"
          :pending="send.pending.value"
          :error="send.result.value?.ok === false ? send.result.value.message : null"
          :hint="data?.telegram ? 'Ответ придёт сюда и в Telegram.' : 'Ответ придёт сюда. Привяжите Telegram в настройках, чтобы получать его и там.'"
          @send="onSend"
        />
      </section>
    </main>
  </div>
</template>
