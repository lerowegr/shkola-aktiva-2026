<script setup lang="ts">
import { Bot, SendHorizontal } from "lucide-vue-next";

import type { ChatMessage } from "~~/lib/messages/threads";

/**
 * Переписка: пузыри по дням и поле ввода. Своя сторона — справа.
 * Enter отправляет, Shift+Enter — новая строка.
 */
const props = defineProps<{
  messages: ChatMessage[];
  side: "candidate" | "staff";
  placeholder: string;
  hint?: string | null;
  pending?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{ send: [text: string] }>();

const text = ref("");
const list = ref<HTMLElement | null>(null);
const area = ref<HTMLTextAreaElement | null>(null);

function mine(message: ChatMessage) {
  return props.side === "staff" ? message.author === "STAFF" : message.author === "CANDIDATE";
}

const groups = computed(() => {
  const days: { day: Date; items: ChatMessage[] }[] = [];
  for (const message of props.messages) {
    const at = new Date(message.createdAt);
    const last = days.at(-1);
    if (last && mskDayKey(last.day) === mskDayKey(at)) last.items.push(message);
    else days.push({ day: at, items: [message] });
  }
  return days;
});

function scrollDown() {
  nextTick(() => list.value?.scrollTo({ top: list.value.scrollHeight }));
}
watch(() => props.messages.length, scrollDown);
onMounted(scrollDown);

function grow() {
  if (!area.value) return;
  area.value.style.height = "auto";
  area.value.style.height = `${Math.min(area.value.scrollHeight, 160)}px`;
}

function submit() {
  const value = text.value.trim();
  if (!value || props.pending) return;
  emit("send", value);
}

// Родитель очищает поле, только когда сообщение ушло.
function clear() {
  text.value = "";
  nextTick(grow);
}
defineExpose({ clear });

function onKey(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    submit();
  }
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div ref="list" class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
      <p v-if="messages.length === 0" class="text-ink-soft m-auto max-w-xs text-center text-sm">
        Сообщений пока нет.
      </p>

      <section v-for="group in groups" :key="group.day.toISOString()" class="flex flex-col gap-2">
        <p class="bg-paper text-ink-soft mx-auto rounded-full px-3 py-1 text-xs">
          {{ mskFormat(group.day, "EEEE, d MMMM") }}
        </p>

        <div
          v-for="message in group.items"
          :key="message.id"
          class="flex"
          :class="mine(message) ? 'justify-end' : 'justify-start'"
        >
          <div
            class="max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm sm:max-w-[70%]"
            :class="{
              'bg-accent text-accent-ink rounded-br-md': mine(message),
              'bg-paper border-line rounded-bl-md border': !mine(message) && message.author !== 'BOT',
              'bg-brand-purple-soft/50 rounded-bl-md': message.author === 'BOT',
            }"
          >
            <p
              v-if="message.author === 'BOT' || (side === 'staff' && message.author === 'STAFF') || (side === 'candidate' && message.author === 'STAFF')"
              class="mb-0.5 flex items-center gap-1 text-xs font-semibold"
              :class="mine(message) ? 'text-white/80' : 'text-ink-soft'"
            >
              <Bot v-if="message.author === 'BOT'" class="size-3.5" aria-hidden="true" />
              {{ message.author === "BOT" ? "Бот" : side === "candidate" ? "Организаторы" : message.authorName ?? "Вы" }}
            </p>
            <p class="break-words whitespace-pre-line">{{ message.text }}</p>
            <p class="mt-1 text-right text-[11px]" :class="mine(message) ? 'text-white/70' : 'text-ink-soft'">
              <template v-if="message.via === 'TELEGRAM'">через Telegram · </template>{{ mskTime(message.createdAt) }}
            </p>
          </div>
        </div>
      </section>
    </div>

    <form class="border-line flex flex-col gap-1.5 border-t p-3" @submit.prevent="submit">
      <div class="flex items-end gap-2">
        <label class="sr-only" for="chat-input">{{ placeholder }}</label>
        <textarea
          id="chat-input"
          ref="area"
          v-model="text"
          rows="1"
          maxlength="4000"
          :placeholder="placeholder"
          class="border-line bg-paper focus:border-accent focus:ring-accent/20 max-h-40 min-h-11 flex-1 resize-none rounded-2xl border px-4 py-2.5 text-base outline-none focus:ring-4 sm:text-sm"
          @input="grow"
          @keydown="onKey"
        />
        <button
          type="submit"
          class="bg-accent text-accent-ink grid size-11 shrink-0 place-items-center rounded-2xl disabled:opacity-40"
          :disabled="!text.trim() || pending"
          aria-label="Отправить"
        >
          <SendHorizontal class="size-5" aria-hidden="true" />
        </button>
      </div>
      <p v-if="error" class="text-danger px-1 text-xs">{{ error }}</p>
      <p v-else-if="hint" class="text-ink-soft px-1 text-xs">{{ hint }}</p>
    </form>
  </div>
</template>
