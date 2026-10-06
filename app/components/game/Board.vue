<script setup lang="ts">
import { avatarLetters } from "~~/lib/profile/display";
import { describeResult, type GameKind } from "~~/lib/games/rules";

interface Row {
  rank: number;
  name: string;
  avatar: string | null;
  isMe: boolean;
  fullName: string | null;
  score?: number;
  moves?: number | null;
  durationMs?: number;
  points?: number;
}

/**
 * Строки таблицы рейтинга: место, аватар, имя, очки. Своя строка подсвечена,
 * настоящее имя видно только staff (сервер его иначе не отдаёт).
 */
withDefaults(
  defineProps<{ rows: Row[]; game?: GameKind | null; points?: boolean }>(),
  { game: null, points: false },
);

function result(game: GameKind, row: Row): string {
  return describeResult(game, { score: row.score ?? 0, moves: row.moves ?? null, durationMs: row.durationMs ?? 0 });
}
</script>

<template>
  <ol class="flex flex-col gap-1">
    <li
      v-for="row in rows"
      :key="`${row.rank}-${row.name}`"
      class="flex items-center gap-3 rounded-2xl px-3 py-2"
      :class="row.isMe ? 'bg-accent/10 font-semibold' : ''"
    >
      <span class="w-7 shrink-0 text-center tabular-nums" :class="row.rank <= 3 ? 'font-display text-lg' : ''" aria-hidden="true">{{ row.rank }}</span>
      <span class="grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-line text-sm font-bold">
        <img v-if="row.avatar" :src="row.avatar" alt="" class="size-full object-cover">
        <span v-else aria-hidden="true">{{ avatarLetters(row.name) }}</span>
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate">{{ row.name }}{{ row.isMe ? " · это вы" : "" }}</span>
        <span v-if="row.fullName" class="text-ink-soft block truncate text-xs">{{ row.fullName }}</span>
      </span>
      <span class="shrink-0 text-sm tabular-nums">
        {{ game ? result(game, row) : `${row.points ?? 0} очков` }}
      </span>
    </li>
  </ol>
</template>
