<script setup lang="ts">
import { CircleCheck, CloudOff, Eye, LoaderCircle, UserCheck } from "lucide-vue-next";

import type { ActionResult } from "~/composables/useAction";
import { reviewSummary } from "~~/lib/applications/review";
import type { StaffApplication, StaffReview } from "~~/lib/applications/staff";

/**
 * Панель оценки. Своя оценка — кнопки баллов, маркеры и комментарий,
 * всё сохраняется само. Чужая — то же самое только для чтения.
 */
const props = defineProps<{
  card: StaffApplication;
  review: StaffReview;
  canEdit: boolean;
}>();

const emit = defineEmits<{ changed: [] }>();

// Снятый балл — undefined, а не удалённый ключ: так реактивность не теряет поле.
const scores = reactive<Record<string, number | undefined>>({ ...props.review.scores });
const markers = reactive<Record<string, string>>({ ...props.review.markers });
const comment = ref(props.review.comment);
const savedAt = ref<Date | null>(props.review.touched ? new Date(props.review.updatedAt) : null);
const savedBy = ref<string | null>(props.review.updatedBy);

const user = await useSession();
const autosave = useAutosave(700);

const summary = computed(() =>
  reviewSummary(
    props.card.criteria,
    Object.entries(scores)
      .filter((entry): entry is [string, number] => entry[1] !== undefined)
      .map(([criterionId, score]) => ({ criterionId, score })),
  ),
);

function saved(result: ActionResult) {
  if (result.ok && typeof result.updatedAt === "string") {
    savedAt.value = new Date(result.updatedAt);
    savedBy.value = user.value?.name ?? savedBy.value;
    emit("changed");
  }
  return result;
}

function setScore(criterionId: string, score: number) {
  if (!props.canEdit) return;
  // Повторное нажатие на выбранный балл снимает его.
  const next = scores[criterionId] === score ? null : score;
  scores[criterionId] = next ?? undefined;

  autosave.schedule(`score:${criterionId}`, async () =>
    saved(
      await $fetch<ActionResult>("/api/staff/reviews/score", {
        method: "POST",
        body: { reviewId: props.review.id, criterionId, score: next },
        ignoreResponseError: true,
      }),
    ),
  );
  void autosave.flush();
}

function setText(field: string, value: string) {
  if (!props.canEdit) return;
  if (field === "comment") comment.value = value;
  else markers[field] = value;

  autosave.schedule(`text:${field}`, async () =>
    saved(
      await $fetch<ActionResult>("/api/staff/reviews/text", {
        method: "POST",
        body: { reviewId: props.review.id, field, value },
        ignoreResponseError: true,
      }),
    ),
  );
}

function when(date: Date) {
  return mskFormat(date, "d MMM, HH:mm");
}
</script>

<template>
  <section class="bg-card border-line flex flex-col rounded-3xl border">
    <div class="flex items-start justify-between gap-3 p-5 pb-4">
      <div class="flex flex-col gap-1">
        <h2 class="font-display text-xl">Оценка</h2>
        <p v-if="review.isMine" class="text-ok flex items-center gap-1.5 text-sm">
          <UserCheck class="size-4" aria-hidden="true" />
          {{ card.stage === "HOMEWORK" ? "Работа назначена вам" : card.stage === "INTERVIEW" ? "Собеседование ваше" : "Анкета назначена вам" }}
        </p>
        <p v-else class="text-ink-soft flex items-center gap-1.5 text-sm">
          <Eye class="size-4" aria-hidden="true" /> Проверяет {{ review.reviewer.name }} — только просмотр
        </p>
      </div>
      <div class="bg-accent text-accent-ink flex min-w-16 flex-col items-center rounded-2xl px-3 py-2">
        <span class="font-display text-2xl leading-none">{{ summary.total ?? "—" }}</span>
        <span class="text-xs text-white/80">из {{ summary.max }}</span>
      </div>
    </div>

    <div class="flex flex-col gap-6 px-5 pb-5">
      <!-- Критерии -->
      <div v-for="criterion in card.criteria" :key="criterion.id" class="flex flex-col gap-2.5">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold">{{ criterion.title }}</h3>
          <span v-if="criterion.badge" class="bg-paper text-ink-soft rounded-md px-1.5 py-0.5 text-xs">
            {{ criterion.badge }}
          </span>
        </div>

        <div
          role="radiogroup"
          :aria-label="criterion.title"
          class="grid gap-1.5"
          :style="{ gridTemplateColumns: `repeat(${criterion.maxScore + 1}, minmax(0, 1fr))` }"
        >
          <button
            v-for="score in criterion.maxScore + 1"
            :key="score"
            type="button"
            role="radio"
            :aria-checked="scores[criterion.id] === score - 1"
            :disabled="!canEdit"
            class="min-h-11 rounded-xl border text-sm font-semibold transition disabled:cursor-default"
            :class="
              scores[criterion.id] === score - 1
                ? 'border-accent bg-accent text-accent-ink'
                : 'border-line bg-card enabled:hover:border-accent/50'
            "
            @click="setScore(criterion.id, score - 1)"
          >
            {{ score - 1 }}
          </button>
        </div>

        <ul class="flex flex-col gap-1">
          <li
            v-for="level in criterion.levels"
            :key="level.score"
            class="flex gap-2.5 rounded-xl px-2.5 py-2 text-xs leading-relaxed transition"
            :class="scores[criterion.id] === level.score ? 'bg-accent/10 text-ink' : 'text-ink-soft'"
          >
            <b class="text-accent w-3 shrink-0">{{ level.score }}</b>
            <span>{{ level.text }}</span>
          </li>
        </ul>
      </div>

      <!-- Маркеры -->
      <div v-if="card.markers.length" class="border-line flex flex-col gap-4 border-t pt-5">
        <p class="text-ink-soft text-xs font-semibold tracking-wide uppercase">Маркеры</p>
        <div v-for="marker in card.markers" :key="marker.id" class="flex flex-col gap-1.5">
          <label :for="`m-${marker.id}`" class="text-sm font-semibold">{{ marker.title }}</label>
          <p v-if="marker.example" class="text-ink-soft text-xs">{{ marker.example }}</p>
          <p v-if="!canEdit" class="text-sm" :class="markers[marker.id] ? '' : 'text-ink-soft'">
            {{ markers[marker.id] || "—" }}
          </p>
          <input
            v-else
            :id="`m-${marker.id}`"
            :value="markers[marker.id] ?? ''"
            maxlength="2000"
            placeholder="Что заметили в ответах"
            class="border-line bg-paper focus:border-accent focus:ring-accent/20 min-h-11 rounded-xl border px-3 text-sm outline-none focus:ring-4"
            @input="setText(marker.id, ($event.target as HTMLInputElement).value)"
          >
        </div>
        <p class="text-ink-soft text-xs">
          Маркеры отсматриваются мастерами на протяжении всего этапа по общему впечатлению.
        </p>
      </div>

      <!-- Комментарий -->
      <div class="border-line flex flex-col gap-1.5 border-t pt-5">
        <label for="review-comment" class="font-semibold">Комментарий</label>
        <p v-if="!canEdit" class="text-sm whitespace-pre-line" :class="comment ? '' : 'text-ink-soft'">
          {{ comment || "—" }}
        </p>
        <textarea
          v-else
          id="review-comment"
          :value="comment"
          rows="4"
          maxlength="2000"
          placeholder="Что понравилось, что насторожило, на что посмотреть на собеседовании"
          class="border-line bg-paper focus:border-accent focus:ring-accent/20 rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-4"
          @input="setText('comment', ($event.target as HTMLTextAreaElement).value)"
        />
      </div>
    </div>

    <!-- Строка сохранения -->
    <div
      class="border-line text-ink-soft flex items-center justify-between gap-3 rounded-b-3xl border-t px-5 py-3 text-xs"
      aria-live="polite"
    >
      <span class="flex items-center gap-1.5">
        <template v-if="autosave.state.value === 'saving'">
          <LoaderCircle class="size-3.5 animate-spin" aria-hidden="true" /> Сохраняем…
        </template>
        <template v-else-if="autosave.state.value === 'error'">
          <CloudOff class="text-danger size-3.5" aria-hidden="true" />
          <span class="text-danger">{{ autosave.error.value }}</span>
        </template>
        <template v-else-if="savedAt">
          <CircleCheck class="text-ok size-3.5" aria-hidden="true" />
          <span class="text-ok">Оценка сохранена</span>
        </template>
        <template v-else>Оценки ещё нет</template>
      </span>
      <span v-if="savedAt && autosave.state.value !== 'error'">{{ savedBy ? `${savedBy}, ` : "" }}{{ when(savedAt) }}</span>
    </div>
  </section>
</template>
