<script setup lang="ts">
import { ArrowRight, CheckCircle2, FilePen, Lock } from "lucide-vue-next";

import type { CandidateApplication } from "~~/lib/applications/candidate";
import { isEmptyAnswer } from "~~/lib/applications/form";

/** Карточка анкеты в кабинете: где кандидат сейчас и что делать дальше. */
const props = defineProps<{ app: CandidateApplication; admission?: "PASSED" | "REJECTED" | null }>();
const Link = resolveComponent("NuxtLink");

const answered = computed(
  () => props.app.questions.filter((question) => !isEmptyAnswer(props.app.application.answers[question.id])).length,
);
const started = computed(() => props.app.application.id !== null);

const view = computed(() => {
  const { application, stage } = props.app;
  const day = (value: Date | string | null) => (value ? mskFormat(value, "d MMMM") : "");

  if (application.status === "SUBMITTED") {
    const text = props.admission
      ? `Отправлена ${day(application.submittedAt)}. Анкета проверена, результаты объявлены.`
      : `${day(application.submittedAt)} — её уже читает мастер отбора.`;
    return { tone: "done", title: props.admission ? "Анкета проверена" : "Анкета отправлена", text, action: "Посмотреть ответы" };
  }
  if (stage.state === "upcoming") {
    return { tone: "wait", title: "Анкета скоро откроется", text: stage.opensAt ? `Приём начнётся ${day(stage.opensAt)}.` : "Дату открытия объявим.", action: null };
  }
  if (stage.state === "closed") {
    return { tone: "wait", title: "Приём анкет закрыт", text: "Анкета не была отправлена вовремя.", action: started.value ? "Посмотреть ответы" : null };
  }
  return {
    tone: "todo",
    title: started.value ? "Анкета — черновик" : "Заполните анкету",
    text: started.value
      ? `Отвечено ${answered.value} из ${props.app.questions.length}, в конце — домашнее задание.${stage.closesAt ? ` Отправить до ${day(stage.closesAt)}.` : ""}`
      : `${props.app.questions.length} вопросов и домашнее задание. Ответы сохраняются сами.`,
    action: started.value ? "Продолжить" : "Начать",
  };
});
</script>

<template>
  <component
    :is="view.action ? Link : 'div'"
    :to="view.action ? '/cabinet/application' : undefined"
    class="group flex items-center gap-4 rounded-3xl p-5 transition"
    :class="{
      'bg-accent text-accent-ink hover:brightness-110': view.tone === 'todo',
      'bg-brand-green-soft': view.tone === 'done',
      'bg-card border-line border': view.tone === 'wait',
    }"
  >
    <span
      class="grid size-12 shrink-0 place-items-center rounded-2xl"
      :class="view.tone === 'todo' ? 'bg-white/15' : 'bg-white/70'"
    >
      <CheckCircle2 v-if="view.tone === 'done'" class="text-ok size-6" aria-hidden="true" />
      <Lock v-else-if="view.tone === 'wait'" class="text-ink-soft size-5" aria-hidden="true" />
      <FilePen v-else class="size-6" aria-hidden="true" />
    </span>
    <div class="min-w-0 flex-1">
      <p class="font-semibold">{{ view.title }}</p>
      <p class="text-sm" :class="view.tone === 'todo' ? 'text-white/80' : 'text-ink-soft'">{{ view.text }}</p>
    </div>
    <span v-if="view.action" class="flex shrink-0 items-center gap-1 text-sm font-semibold">
      <span class="hidden sm:inline">{{ view.action }}</span>
      <ArrowRight class="size-5 transition group-hover:translate-x-0.5" aria-hidden="true" />
    </span>
  </component>
</template>
