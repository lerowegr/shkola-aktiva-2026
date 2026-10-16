<script setup lang="ts">
import { parseHelp } from "~/utils/rich-help";

/**
 * Подсказка вопроса: абзацы и переписки. Переписка — как в мессенджере:
 * шапка с собеседником, его сообщения слева, справа — пустое «твоё»
 * сообщение: продолжить переписку и есть задание.
 */
const props = defineProps<{ text: string }>();
const blocks = computed(() => parseHelp(props.text));
const initial = (name: string) => (name.trim()[0] ?? "?").toUpperCase();
// Строка — отдельный пузырь, как в мессенджере: длинное сообщение подряд
// несколькими сообщениями читается легче одной простыни.
const bubbles = (messages: { author: string; text: string }[]) =>
  messages.flatMap((message) =>
    message.text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, i) => ({ author: message.author, text: line, first: i === 0 })),
  );
</script>

<template>
  <div class="flex flex-col gap-3 text-sm">
    <template v-for="(block, index) in blocks" :key="index">
      <h4 v-if="block.kind === 'heading'" class="font-display text-ink mt-2 text-lg first:mt-0">{{ block.text }}</h4>
      <p v-else-if="block.kind === 'text'" class="text-ink-soft whitespace-pre-line">{{ block.text }}</p>

      <figure v-else class="border-line overflow-hidden rounded-3xl border bg-[#dfe9f2]" aria-label="Переписка">
        <figcaption v-if="block.messages[0]?.author" class="bg-card border-line flex items-center gap-3 border-b px-4 py-2.5">
          <span class="bg-brand-purple text-paper grid size-9 shrink-0 place-items-center rounded-full font-semibold" aria-hidden="true">
            {{ initial(block.messages[0]!.author) }}
          </span>
          <span class="flex flex-col leading-tight">
            <span class="text-ink font-semibold">{{ block.messages[0]!.author }}</span>
            <span class="text-ink-soft text-xs">в сети</span>
          </span>
        </figcaption>
        <div class="flex flex-col gap-2 p-3 sm:p-4">
          <div
            v-for="(bubble, i) in bubbles(block.messages)"
            :key="i"
            class="text-ink max-w-[88%] self-start rounded-2xl rounded-bl-md bg-white px-3.5 py-2 shadow-sm"
          >
            <span v-if="bubble.first && bubble.author && bubble.author !== block.messages[0]!.author" class="text-accent mb-0.5 block text-xs font-semibold">
              {{ bubble.author }}
            </span>
            {{ bubble.text }}
          </div>
          <div class="border-accent/50 text-accent max-w-[70%] self-end rounded-2xl rounded-br-md border-2 border-dashed bg-white/60 px-3.5 py-2.5 italic">
            Твой ответ…
          </div>
        </div>
      </figure>
    </template>
  </div>
</template>
