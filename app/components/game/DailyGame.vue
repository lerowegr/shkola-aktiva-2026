<script setup lang="ts">
import { Flame } from "lucide-vue-next";

import type { DailyKind } from "~~/lib/games/daily";

/**
 * Задание дня: та же игра, но расклад фиксирован датой (seed) и итог
 * уходит не в общий рейтинг, а в серию дня.
 */
const props = defineProps<{ kind: DailyKind; seed: number }>();
const emit = defineEmits<{ solved: [] }>();

const send = useAction("/api/cabinet/daily/solve");
const reply = ref<{ ok: boolean; message?: string; streak?: number; best?: number } | null>(null);
const round = ref(0);

async function finished(result: { score: number; moves?: number | null; durationMs: number }) {
  // Сервер принимает целые числа, а таймеры игр бывают дробными.
  reply.value = (await send.submit({
    kind: props.kind,
    score: Math.round(result.score),
    moves: result.moves == null ? result.moves : Math.round(result.moves),
    durationMs: Math.round(result.durationMs),
  })) as typeof reply.value;
  if (reply.value?.ok) emit("solved");
}

function again() {
  reply.value = null;
  round.value++;
}
</script>

<template>
  <div class="flex flex-col gap-5">
    <ClientOnly v-if="!reply">
      <GameMemory v-if="kind === 'MEMORY'" :key="round" :seed="seed" @finished="finished" />
      <GamePixel v-else-if="kind === 'PIXEL'" :key="round" :seed="seed" @finished="finished" />
      <GameQuiz v-else :key="round" :seed="seed" pool="local" @finished="finished" />
      <template #fallback>
        <div class="bg-line/60 mx-auto aspect-square w-full max-w-sm animate-pulse rounded-3xl" aria-hidden="true" />
      </template>
    </ClientOnly>

    <section v-else class="bg-card border-line flex flex-col items-center gap-4 rounded-3xl border p-6 text-center" aria-live="polite">
      <img src="/brand/mascots/yellow-b.webp" alt="" class="w-24">
      <template v-if="reply.ok">
        <p class="font-display flex items-center gap-2 text-2xl"><Flame class="size-6" aria-hidden="true" /> Серия: {{ reply.streak }}</p>
        <p class="text-ink-soft">Задание дня решено. Лучшая серия — {{ reply.best }}. Возвращайтесь завтра.</p>
        <div class="w-full max-w-sm">
          <UiButton href="/cabinet">В кабинет</UiButton>
        </div>
      </template>
      <template v-else>
        <p class="font-display text-2xl">Не засчитано</p>
        <UiNotice :message="reply.message" />
        <div class="w-full max-w-sm">
          <UiButton @click="again">Попробовать ещё</UiButton>
        </div>
      </template>
    </section>
  </div>
</template>
