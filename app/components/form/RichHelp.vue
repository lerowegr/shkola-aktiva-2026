<script setup lang="ts">
import { ClipboardList } from "lucide-vue-next";

import { parseHelp, type HelpBlock } from "~/utils/rich-help";

/**
 * Подсказка вопроса: абзацы, задания и переписки.
 *
 * Заголовок «# Задание 1. Название» открывает карточку задания: цветная
 * шапка с номером, ниже — его текст. Строки «- …» и «1. …» — списки,
 * короткая строка с двоеточием («Твоя задача:») — подзаголовок. Переписка —
 * как в мессенджере: шапка с собеседником, его сообщения слева, справа —
 * пустое «твоё» сообщение: продолжить переписку и есть задание.
 */
const props = defineProps<{ text: string }>();
const blocks = computed(() => parseHelp(props.text));

interface Group {
  badge: string | null;
  title: string | null;
  blocks: HelpBlock[];
}
// Блоки — группами по заголовкам: каждое задание своей карточкой.
const groups = computed<Group[]>(() => {
  const result: Group[] = [];
  for (const block of blocks.value) {
    if (block.kind === "heading") {
      const match = /^(Задание\s*\d+)\.?\s*(.*)$/i.exec(block.text);
      result.push({ badge: match ? match[1]! : null, title: match ? match[2]! || null : block.text, blocks: [] });
    } else if (result.length) result.at(-1)!.blocks.push(block);
    else result.push({ badge: null, title: null, blocks: [block] });
  }
  return result;
});

type Line = { kind: "p" | "label" | "bullet" | "number"; text: string; mark?: string };
function lines(text: string): Line[] {
  return text
    .split("\n")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((line): Line => {
      const bullet = /^[-•]\s+(.*)$/.exec(line);
      if (bullet) return { kind: "bullet", text: bullet[1]! };
      const number = /^(\d+)[.)]\s+(.*)$/.exec(line);
      if (number) return { kind: "number", text: number[2]!, mark: number[1]! };
      if (line.endsWith(":") && line.length <= 60) return { kind: "label", text: line };
      return { kind: "p", text: line };
    });
}

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
const TONES = ["bg-brand-orange-soft", "bg-brand-purple-soft", "bg-brand-green-soft", "bg-brand-yellow-soft"];
</script>

<template>
  <div class="flex flex-col gap-3 text-sm">
    <component
      :is="group.title || group.badge ? 'section' : 'div'"
      v-for="(group, groupIndex) in groups"
      :key="groupIndex"
      :class="group.title || group.badge ? 'border-line bg-paper mt-1 overflow-hidden rounded-3xl border' : 'flex flex-col gap-3'"
    >
      <header v-if="group.title || group.badge" class="flex items-center gap-3 px-4 py-3" :class="TONES[groupIndex % TONES.length]">
        <span class="bg-card grid size-9 shrink-0 place-items-center rounded-xl" aria-hidden="true">
          <ClipboardList class="size-5" />
        </span>
        <span class="flex min-w-0 flex-col leading-tight">
          <span v-if="group.badge" class="text-ink/70 text-xs font-semibold tracking-wide uppercase">{{ group.badge }}</span>
          <span v-if="group.title" class="font-display text-ink text-lg">{{ group.title }}</span>
        </span>
      </header>

      <div class="flex flex-col gap-3" :class="(group.title || group.badge) && 'p-4'">
        <template v-for="(block, index) in group.blocks" :key="index">
          <div v-if="block.kind === 'text'" class="text-ink-soft flex flex-col gap-1.5 leading-relaxed">
            <template v-for="(line, i) in lines(block.text)" :key="i">
              <p v-if="line.kind === 'label'" class="text-ink mt-1 font-semibold first:mt-0">{{ line.text }}</p>
              <p v-else-if="line.kind === 'bullet'" class="flex gap-2 pl-1">
                <span class="bg-accent mt-2 size-1.5 shrink-0 rounded-full" aria-hidden="true" />
                <span>{{ line.text }}</span>
              </p>
              <p v-else-if="line.kind === 'number'" class="flex gap-2">
                <b class="text-accent w-4 shrink-0 text-right">{{ line.mark }}.</b>
                <span>{{ line.text }}</span>
              </p>
              <p v-else>{{ line.text }}</p>
            </template>
          </div>
          <h4 v-else-if="block.kind === 'heading'" class="font-display text-ink text-lg">{{ block.text }}</h4>

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
    </component>
  </div>
</template>
