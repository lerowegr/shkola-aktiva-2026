<script setup lang="ts">
import { RotateCcw } from "lucide-vue-next";

import type { Standing } from "~~/lib/games/results";
import { describeResult, type GameKind } from "~~/lib/games/rules";

/**
 * Итог партии: отправляем результат и показываем, рекорд ли и какое место.
 * Отказ сервера («слишком быстро») не мешает играть дальше.
 */
const props = defineProps<{ game: GameKind; result: { score: number; moves?: number | null; durationMs: number } }>();
const emit = defineEmits<{ again: [] }>();

const send = useAction("/api/cabinet/games/result");
const reply = ref<{ ok: boolean; message?: string; record?: boolean; standing?: Standing } | null>(null);
onMounted(async () => {
  // Таймеры игр копят время из performance.now() — дробные миллисекунды;
  // сервер принимает целые числа.
  const { score, moves, durationMs } = props.result;
  reply.value = (await send.submit({
    game: props.game,
    score: Math.round(score),
    moves: moves == null ? moves : Math.round(moves),
    durationMs: Math.round(durationMs),
  })) as typeof reply.value;
});

const mine = computed(() => describeResult(props.game, { moves: null, ...props.result }));
</script>

<template>
  <section class="bg-card border-line flex flex-col items-center gap-4 rounded-3xl border p-6 text-center" aria-live="polite">
    <img src="/brand/mascots/yellow-b.webp" alt="" class="w-24">
    <p class="font-display text-2xl">{{ reply?.record ? "Новый рекорд!" : "Готово!" }}</p>
    <p class="text-xl font-semibold">{{ mine }}</p>

    <p v-if="send.pending.value" class="text-ink-soft text-sm">Сохраняем результат…</p>
    <template v-else-if="reply?.ok && reply.standing">
      <p v-if="!reply.record && reply.standing.best" class="text-ink-soft">
        Ваш лучший: {{ describeResult(game, reply.standing.best) }}
      </p>
      <p v-if="reply.standing.rank" class="text-ink-soft">
        Место среди кандидатов: <strong class="text-ink">{{ reply.standing.rank }}</strong> из {{ reply.standing.players }}
      </p>
      <p v-else class="text-ink-soft text-sm">Организаторы в рейтинг не попадают.</p>
    </template>
    <UiNotice v-else-if="reply && !reply.ok" :message="reply.message" />

    <div class="flex w-full max-w-sm flex-col gap-2 sm:flex-row">
      <UiButton @click="emit('again')"><RotateCcw class="size-4" aria-hidden="true" /> Ещё раз</UiButton>
      <UiButton variant="ghost" href="/cabinet/games">Все игры</UiButton>
    </div>
  </section>
</template>
