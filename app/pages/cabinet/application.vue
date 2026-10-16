<script setup lang="ts">
import { CheckCircle2 } from "lucide-vue-next";

import type { ActionResult } from "~/composables/useAction";
import type { CandidateApplication } from "~~/lib/applications/candidate";
import type { HomeworkView } from "~~/lib/applications/homework";
import type { AnswerValue } from "~~/lib/applications/form";

useHead({ title: "Анкета" });

const [{ data, refresh }, { data: homework, refresh: refreshHomework }] = await Promise.all([
  useFetch("/api/cabinet/application"),
  useFetch<{ homework: HomeworkView | null }>("/api/cabinet/homework"),
]);
const hw = computed(() => homework.value?.homework ?? null);
const hwCurrent = computed(() => hw.value?.submissions.find((item) => item.current) ?? null);
// Домашнее задание — последний шаг анкеты: без него анкета не уходит.
const extraStep = computed(() =>
  hw.value
    ? {
        title: "Домашнее задание",
        description: "Часть анкеты: прикрепите работу — PDF или ответ текстом. Без неё анкета не отправится.",
        done: Boolean(hwCurrent.value),
        problem: "Прикрепите домашнее задание — без него анкета не отправится.",
      }
    : null,
);
const app = computed(() => data.value?.data as CandidateApplication | null | undefined);

// Локальная копия ответов: поля меняются сразу, сервер догоняет автосохранением.
const profile = reactive({ lastName: "", firstName: "", middleName: "", studentId: "" });
const answers = ref<Record<string, AnswerValue>>({});

watch(
  app,
  (value) => {
    if (!value) return;
    Object.assign(profile, value.application.profile);
    answers.value = { ...value.application.answers };
  },
  { immediate: true },
);

const editable = computed(() => app.value?.editable ?? false);
const autosave = useAutosave();

function saveAnswer(questionId: string, value: AnswerValue | undefined) {
  answers.value[questionId] = value ?? "";
  autosave.schedule(`q:${questionId}`, () =>
    $fetch<ActionResult>("/api/cabinet/application/answer", {
      method: "POST",
      body: { questionId, value: value ?? "" },
      ignoreResponseError: true,
    }),
  );
}

type ProfileField = keyof typeof profile;
function saveProfile(field: ProfileField, value: string) {
  profile[field] = value;
  autosave.schedule(`p:${field}`, () =>
    $fetch<ActionResult>("/api/cabinet/application/profile", {
      method: "POST",
      body: { [field]: value },
      ignoreResponseError: true,
    }),
  );
}

// Только для чтения (отправлена или приём закрыт): все разделы подряд,
// сквозная нумерация.
const sections = computed(() => {
  let number = 0;
  return (app.value?.sections ?? []).map((section) => ({
    ...section,
    items: (app.value?.questions ?? [])
      .filter((question) => question.section === section.title)
      .map((question) => ({ number: ++number, question })),
  }));
});

// --- Отправка ---------------------------------------------------------------
const submit = useAction("/api/cabinet/application/submit");

async function send() {
  const result = await submit.submit({});
  if (result.ok) {
    await Promise.all([refresh(), refreshHomework()]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  return result as { ok: boolean; message?: string; problems?: { field: string; message: string }[] };
}

function day(value: string | Date | null) {
  return value ? mskFormat(value, "d MMMM, HH:mm") : "";
}
</script>

<template>
  <div class="pb-16">
    <AppHeader />

    <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <NuxtLink to="/cabinet" class="text-ink-soft hover:text-ink text-sm">← Кабинет</NuxtLink>

      <div v-if="!app" class="text-ink-soft">Отбор ещё не начался.</div>

      <template v-else>
        <div class="flex flex-col gap-2">
          <h1 class="font-display text-3xl">Анкета</h1>
          <p class="text-ink-soft">{{ app.seasonTitle }}</p>
        </div>

        <!-- Состояние анкеты -->
        <div
          v-if="app.application.status === 'SUBMITTED'"
          class="bg-brand-green-soft flex items-start gap-3 rounded-3xl p-5"
        >
          <CheckCircle2 class="text-ok size-6 shrink-0" aria-hidden="true" />
          <div>
            <p class="font-semibold">Анкета отправлена {{ day(app.application.submittedAt) }}</p>
            <p class="text-ink-soft text-sm">
              Её уже читает мастер отбора. О следующем шаге сообщим здесь и в Telegram.
            </p>
          </div>
        </div>
        <div v-else-if="app.stage.state === 'upcoming'" class="bg-brand-yellow-soft rounded-3xl p-5">
          <p class="font-semibold">Приём анкет ещё не открыт</p>
          <p class="text-ink-soft text-sm">
            {{ app.stage.opensAt ? `Откроется ${day(app.stage.opensAt)}.` : "Дату открытия объявим скоро." }}
          </p>
        </div>
        <div v-else-if="app.stage.state === 'closed'" class="bg-brand-red-soft rounded-3xl p-5">
          <p class="font-semibold">Приём анкет закрыт</p>
          <p class="text-ink-soft text-sm">Анкета не была отправлена до дедлайна.</p>
        </div>
        <p v-else-if="app.stage.closesAt" class="text-ink-soft text-sm">
          Отправить нужно до {{ day(app.stage.closesAt) }}. Ответы сохраняются сами — можно вернуться позже.
        </p>

        <FormWizard
          v-if="editable"
          :questions="app.questions"
          :sections="app.sections"
          :answers="answers"
          :profile="profile"
          :save-state="autosave.state.value"
          :save-error="autosave.error.value"
          :sending="submit.pending.value"
          :flush="autosave.flush"
          :send="send"
          :extra-step="extraStep"
          @answer="saveAnswer"
          @profile="saveProfile"
        >
          <template #extra>
            <AppHomeworkStep v-if="hw" :hw="hw" @changed="refreshHomework" />
          </template>
          <template #extra-summary>
            <div>
              <dt class="text-ink-soft">Работа</dt>
              <dd>
                <template v-if="hwCurrent">{{ hwCurrent.file?.filename ?? "ответ текстом" }}{{ hwCurrent.file && hwCurrent.text ? " + комментарий" : "" }}</template>
                <span v-else class="text-danger">не прикреплена</span>
              </dd>
            </div>
          </template>
        </FormWizard>

        <template v-else>
          <section class="bg-card border-line grid gap-3 rounded-3xl border p-4 sm:grid-cols-2 sm:p-5">
            <p class="flex flex-col">
              <span class="text-ink-soft text-sm">ФИО</span>
              <span>{{ [profile.lastName, profile.firstName, profile.middleName].filter(Boolean).join(" ") || "—" }}</span>
            </p>
            <p class="flex flex-col">
              <span class="text-ink-soft text-sm">Студенческий билет</span>
              <span>{{ profile.studentId || "—" }}</span>
            </p>
          </section>
          <section v-for="section in sections" :key="section.title" class="flex flex-col gap-3">
            <h2 class="font-display text-lg">{{ section.title }}</h2>
            <FormQuestion
              v-for="item in section.items"
              :key="item.question.id"
              :number="item.number"
              :question="item.question"
              readonly
              :model-value="answers[item.question.id]"
            />
          </section>
          <section v-if="hw && (hw.submissions.length || hw.task)" class="flex flex-col gap-3">
            <h2 class="font-display text-lg">Домашнее задание</h2>
            <AppHomeworkStep :hw="hw" />
          </section>
        </template>
      </template>
    </main>

  </div>
</template>
