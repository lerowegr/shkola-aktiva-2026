<script setup lang="ts">
import { CalendarClock, ChevronLeft, ChevronRight, FileText, MapPin, Send } from "lucide-vue-next";

import type { StaffApplication, StaffApplicationResponse } from "~~/lib/applications/staff";

/**
 * Анкета глазами мастера: слева ответы кандидата, справа оценка.
 * Кнопки «Предыдущая / Следующая» листают тот список, откуда пришли.
 */
definePageMeta({ layout: "staff" });

const route = useRoute();
const id = computed(() => String(route.params.id));
const from = computed(() => (route.query.from === "all" ? "all" : "mine"));
const stage = computed(() =>
  route.query.stage === "HOMEWORK" || route.query.stage === "INTERVIEW" ? route.query.stage : "APPLICATION",
);

const { data, refresh } = await useFetch<StaffApplicationResponse>(() => `/api/staff/applications/${id.value}`, {
  query: { from, stage },
  key: `staff-app-${id.value}-${stage.value}`,
});

const card = computed(() => data.value?.card);
useHead({ title: () => card.value?.name ?? "Анкета" });

const shownReview = ref(0);
watch(id, () => (shownReview.value = 0));
const review = computed(() => {
  const reviews = card.value?.reviews ?? [];
  const mine = reviews.findIndex((item) => item.isMine);
  return reviews[mine >= 0 && shownReview.value === 0 ? mine : shownReview.value] ?? null;
});

const back = computed(() => {
  if (stage.value === "HOMEWORK") return { to: "/staff/homework", label: "Центр оценки" };
  if (stage.value === "INTERVIEW") return { to: "/staff/interviews", label: "Собеседования" };
  return data.value?.scope === "all" ? { to: "/staff/all", label: "Все анкеты" } : { to: "/staff", label: "Мои анкеты" };
});
const stageQuery = computed(() => (stage.value === "APPLICATION" ? "" : `&stage=${stage.value}`));
const go = (target: string | null) =>
  target && navigateTo(`/staff/applications/${target}?from=${data.value?.scope ?? "mine"}${stageQuery.value}`);

const currentWork = computed(() => card.value?.submissions.find((item) => item.current) ?? null);
const olderWork = computed(() => card.value?.submissions.filter((item) => !item.current) ?? []);
const kb = (size: number) => (size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} МБ` : `${Math.ceil(size / 1024)} КБ`);

// Шапка вкладок пересчитывает «осталось проверить» после каждой оценки.
async function changed() {
  await refreshNuxtData("staff-nav");
}

function answerText(answer: StaffApplication["questions"][number]["answer"]) {
  if (answer === null || answer === "") return null;
  return Array.isArray(answer) ? answer.join(", ") : answer;
}

function isLink(value: string | null) {
  return !!value && /^https?:\/\//.test(value);
}

// --- Переназначение -----------------------------------------------------------
const { data: pool } = await useFetch("/api/staff/reviewers", {
  immediate: !!data.value?.canAssign,
  key: "staff-reviewers",
});
const target = ref("");
const reassign = useAction("/api/staff/applications/reassign");
async function pass() {
  const result = await reassign.submit({ applicationId: id.value, reviewerId: target.value, stage: stage.value });
  if (result.ok) {
    target.value = "";
    await refresh();
    await refreshNuxtData("staff-nav");
  }
}
</script>

<template>
  <main v-if="card" class="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-6">
    <NuxtLink :to="back.to" class="text-ink-soft hover:text-ink flex items-center gap-1 self-start text-sm">
      <ChevronLeft class="size-4" aria-hidden="true" /> {{ back.label }}
    </NuxtLink>

    <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-3">
        <StaffAvatar :seed="card.id" :text="card.initials" size="md" />
        <div class="min-w-0">
          <h1 class="text-xl font-semibold sm:text-2xl">{{ card.name }}</h1>
          <p class="text-ink-soft text-sm">
            <template v-if="card.telegramUsername">@{{ card.telegramUsername }} · </template>
            <template v-if="card.stage !== 'APPLICATION' && currentWork">
              работа сдана {{ mskFormat(currentWork.submittedAt, "d MMM, HH:mm") }}
            </template>
            <template v-else>
              анкета отправлена {{ card.submittedAt ? mskFormat(card.submittedAt, "d MMM, HH:mm") : "—" }}
            </template>
          </p>
        </div>
      </div>
      <div class="flex gap-2">
        <UiButton variant="ghost" class="min-h-10 px-3 text-sm sm:w-auto" :disabled="!data?.prev" @click="go(data?.prev ?? null)">
          <ChevronLeft class="size-4" aria-hidden="true" /> Предыдущая
        </UiButton>
        <UiButton variant="ghost" class="min-h-10 px-3 text-sm sm:w-auto" :disabled="!data?.next" @click="go(data?.next ?? null)">
          Следующая <ChevronRight class="size-4" aria-hidden="true" />
        </UiButton>
      </div>
    </div>

    <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <!-- Слева: работа этапа и/или ответы анкеты -->
      <div class="flex min-w-0 flex-col gap-5">
        <template v-if="card.stage !== 'APPLICATION'">
          <section v-if="card.interview" class="bg-ink text-paper flex flex-col gap-2 rounded-3xl p-5">
            <p class="flex items-center gap-2 font-semibold">
              <CalendarClock class="size-5" aria-hidden="true" />
              {{ mskFormat(card.interview.startsAt, "d MMMM, HH:mm") }}–{{ mskTime(card.interview.endsAt) }}
            </p>
            <p class="text-paper/80 flex items-center gap-2 text-sm">
              <MapPin class="size-4" aria-hidden="true" /> {{ card.interview.location }}
            </p>
            <p class="text-paper/60 text-xs">Собеседуют: {{ card.interview.interviewers.join(", ") }}</p>
          </section>

          <section v-if="card.task" class="bg-card border-line rounded-3xl border p-5">
            <h2 class="text-ink-soft mb-2 text-xs font-semibold tracking-wide uppercase">Задание</h2>
            <p class="text-sm whitespace-pre-line">{{ card.task }}</p>
          </section>

          <section v-if="currentWork" class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-semibold">{{ card.stage === "INTERVIEW" ? "Домашнее задание" : "Работа" }}</h2>
              <span class="text-ink-soft flex items-center gap-1 text-xs">
                <Send v-if="currentWork.via === 'TELEGRAM'" class="size-3.5" aria-hidden="true" />
                {{ currentWork.via === "TELEGRAM" ? "через Telegram" : "на сайте" }} ·
                {{ mskFormat(currentWork.submittedAt, "d MMM, HH:mm") }}
              </span>
            </div>
            <a
              v-if="currentWork.file"
              :href="`/api/files/${currentWork.file.id}`"
              target="_blank"
              rel="noopener"
              class="bg-paper hover:bg-line/50 flex items-center gap-3 rounded-2xl p-3 transition"
            >
              <span class="bg-brand-red-soft grid size-11 shrink-0 place-items-center rounded-xl">
                <FileText class="text-danger size-5" aria-hidden="true" />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold">{{ currentWork.file.filename }}</span>
                <span class="text-ink-soft text-xs">PDF · {{ kb(currentWork.file.size) }}</span>
              </span>
              <span class="text-accent text-sm font-semibold">Открыть</span>
            </a>
            <p v-if="currentWork.text" class="text-sm whitespace-pre-line">{{ currentWork.text }}</p>

            <details v-if="olderWork.length" class="text-sm">
              <summary class="text-ink-soft cursor-pointer">Прежние версии: {{ olderWork.length }}</summary>
              <ul class="mt-2 flex flex-col gap-2">
                <li v-for="item in olderWork" :key="item.id" class="text-ink-soft flex flex-wrap gap-x-2">
                  <span>{{ mskFormat(item.submittedAt, "d MMM, HH:mm") }}</span>
                  <a v-if="item.file" :href="`/api/files/${item.file.id}`" target="_blank" rel="noopener" class="text-accent">
                    {{ item.file.filename }}
                  </a>
                  <span v-if="item.text" class="truncate">«{{ item.text }}»</span>
                </li>
              </ul>
            </details>
          </section>

          <details class="group">
            <summary class="text-ink-soft hover:text-ink cursor-pointer px-1 text-sm font-medium">Анкета кандидата</summary>
            <div class="mt-3">
        <section class="bg-card border-line flex flex-col rounded-3xl border">
        <dl class="bg-paper m-3 grid grid-cols-2 gap-3 rounded-2xl p-4 sm:grid-cols-4">
          <div
v-for="field in [
            { label: 'Студбилет', value: card.profile.studentId },
            { label: 'Фамилия', value: card.profile.lastName },
            { label: 'Имя', value: card.profile.firstName },
            { label: 'Отчество', value: card.profile.middleName },
          ]" :key="field.label">
            <dt class="text-ink-soft text-xs">{{ field.label }}</dt>
            <dd class="text-sm font-semibold">{{ field.value || "—" }}</dd>
          </div>
        </dl>

        <ol class="flex flex-col">
          <li
            v-for="(question, index) in card.questions"
            :key="question.id"
            class="border-line flex gap-3 border-t px-5 py-4 first:border-t-0"
          >
            <span class="bg-accent/10 text-accent grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold">
              {{ index + 1 }}
            </span>
            <div class="flex min-w-0 flex-col gap-1">
              <p class="text-ink-soft text-sm">{{ question.label }}</p>
              <a
                v-if="isLink(answerText(question.answer))"
                :href="answerText(question.answer)!"
                target="_blank"
                rel="noopener noreferrer"
                class="text-accent break-all underline-offset-2 hover:underline"
              >
                {{ answerText(question.answer) }}
              </a>
              <p v-else class="whitespace-pre-line" :class="answerText(question.answer) ? '' : 'text-ink-soft'">
                {{ answerText(question.answer) ?? "Нет ответа" }}
              </p>
            </div>
          </li>
        </ol>
      </section>

            </div>
          </details>
        </template>
        <template v-else>
        <section class="bg-card border-line flex flex-col rounded-3xl border">
        <dl class="bg-paper m-3 grid grid-cols-2 gap-3 rounded-2xl p-4 sm:grid-cols-4">
          <div
v-for="field in [
            { label: 'Студбилет', value: card.profile.studentId },
            { label: 'Фамилия', value: card.profile.lastName },
            { label: 'Имя', value: card.profile.firstName },
            { label: 'Отчество', value: card.profile.middleName },
          ]" :key="field.label">
            <dt class="text-ink-soft text-xs">{{ field.label }}</dt>
            <dd class="text-sm font-semibold">{{ field.value || "—" }}</dd>
          </div>
        </dl>

        <ol class="flex flex-col">
          <li
            v-for="(question, index) in card.questions"
            :key="question.id"
            class="border-line flex gap-3 border-t px-5 py-4 first:border-t-0"
          >
            <span class="bg-accent/10 text-accent grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold">
              {{ index + 1 }}
            </span>
            <div class="flex min-w-0 flex-col gap-1">
              <p class="text-ink-soft text-sm">{{ question.label }}</p>
              <a
                v-if="isLink(answerText(question.answer))"
                :href="answerText(question.answer)!"
                target="_blank"
                rel="noopener noreferrer"
                class="text-accent break-all underline-offset-2 hover:underline"
              >
                {{ answerText(question.answer) }}
              </a>
              <p v-else class="whitespace-pre-line" :class="answerText(question.answer) ? '' : 'text-ink-soft'">
                {{ answerText(question.answer) ?? "Нет ответа" }}
              </p>
            </div>
          </li>
        </ol>
      </section>

        </template>
      </div>

      <!-- Оценка -->
      <div class="flex flex-col gap-3 lg:sticky lg:top-4">
        <div v-if="card.reviews.length > 1" class="bg-card border-line flex gap-1 overflow-x-auto rounded-2xl border p-1">
          <button
            v-for="(item, index) in card.reviews"
            :key="item.id"
            type="button"
            class="min-h-9 shrink-0 rounded-xl px-3 text-sm"
            :class="review?.id === item.id ? 'bg-paper font-semibold' : 'text-ink-soft'"
            @click="shownReview = index"
          >
            {{ item.isMine ? "Моя оценка" : item.reviewer.name }}
          </button>
        </div>

        <StaffReviewPanel
          v-if="review"
          :key="review.id"
          :card="card"
          :review="review"
          :can-edit="!!data?.canEdit && review.isMine"
          @changed="changed"
        />
        <div v-else class="bg-card border-line text-ink-soft rounded-3xl border p-5 text-sm">
          Анкета ещё никому не назначена.
        </div>

        <form
          v-if="data?.canAssign"
          class="bg-card border-line flex flex-col gap-2 rounded-3xl border p-4"
          @submit.prevent="pass"
        >
          <label for="reassign" class="text-sm font-semibold">Передать другому мастеру</label>
          <div class="flex gap-2">
            <select
              id="reassign"
              v-model="target"
              class="border-line bg-paper min-h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm"
            >
              <option value="" disabled>Выберите мастера</option>
              <option
                v-for="person in pool?.reviewers ?? []"
                :key="person.id"
                :value="person.id"
                :disabled="card.reviews.some((item) => item.reviewer.id === person.id)"
              >
                {{ person.name }} — {{ person.load }}
              </option>
            </select>
            <UiButton type="submit" class="min-h-11 w-auto px-4 text-sm" :pending="reassign.pending.value" :disabled="!target">
              Передать
            </UiButton>
          </div>
          <UiNotice :ok="reassign.result.value?.ok" :message="reassign.result.value?.message" />
        </form>
      </div>
    </div>
  </main>
</template>
