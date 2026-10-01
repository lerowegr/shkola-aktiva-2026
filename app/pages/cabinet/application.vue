<script setup lang="ts">
import { CheckCircle2, CloudCheck, CloudOff, LoaderCircle, Send } from "lucide-vue-next";

import type { ActionResult } from "~/composables/useAction";
import type { CandidateApplication } from "~~/lib/applications/candidate";
import { isEmptyAnswer, type AnswerValue } from "~~/lib/applications/form";

useHead({ title: "Анкета" });

const { data, refresh } = await useFetch("/api/cabinet/application");
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
const errors = ref<Record<string, string>>({});

function clearError(field: string) {
  if (!(field in errors.value)) return;
  errors.value = Object.fromEntries(Object.entries(errors.value).filter(([key]) => key !== field));
}

function saveAnswer(questionId: string, value: AnswerValue | undefined) {
  answers.value[questionId] = value ?? "";
  clearError(questionId);
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
  clearError(field);
  autosave.schedule(`p:${field}`, () =>
    $fetch<ActionResult>("/api/cabinet/application/profile", {
      method: "POST",
      body: { [field]: value },
      ignoreResponseError: true,
    }),
  );
}

// Разделы в порядке вопросов, сквозная нумерация.
const sections = computed(() => {
  const list: { title: string; items: { number: number; question: CandidateApplication["questions"][number] }[] }[] = [];
  (app.value?.questions ?? []).forEach((question, index) => {
    let section = list.at(-1);
    if (!section || section.title !== question.section) {
      section = { title: question.section, items: [] };
      list.push(section);
    }
    section.items.push({ number: index + 1, question });
  });
  return list;
});

const required = computed(() => (app.value?.questions ?? []).filter((question) => question.required));
const filled = computed(
  () =>
    required.value.filter((question) => !isEmptyAnswer(answers.value[question.id])).length +
    (profile.lastName.trim() ? 1 : 0) +
    (profile.firstName.trim() ? 1 : 0),
);
const total = computed(() => required.value.length + 2);

// --- Отправка ---------------------------------------------------------------
const confirming = ref(false);
const submit = useAction("/api/cabinet/application/submit");

async function send() {
  await autosave.flush();
  const result = await submit.submit({});

  if (result.ok) {
    confirming.value = false;
    await refresh();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  confirming.value = false;
  const problems = (result.problems as { field: string; message: string }[] | undefined) ?? [];
  errors.value = Object.fromEntries(problems.map((problem) => [problem.field, problem.message]));

  const first = problems[0];
  if (first) {
    const target = document.getElementById(first.field in profile ? `p-${first.field}` : `q-${first.field}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function day(value: string | Date | null) {
  return value ? mskFormat(value, "d MMMM, HH:mm") : "";
}
</script>

<template>
  <div class="pb-32">
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

        <!-- ФИО и студбилет -->
        <section class="flex flex-col gap-3">
          <h2 class="font-display text-lg">Кто ты</h2>
          <div class="bg-card border-line grid gap-4 rounded-3xl border p-4 sm:grid-cols-2 sm:p-5">
            <div
              v-for="field in [
                { key: 'lastName', label: 'Фамилия', auto: 'family-name' },
                { key: 'firstName', label: 'Имя', auto: 'given-name' },
                { key: 'middleName', label: 'Отчество — необязательно', auto: 'additional-name' },
                { key: 'studentId', label: 'Номер студенческого — необязательно', auto: 'off' },
              ] as const"
              :id="`p-${field.key}`"
              :key="field.key"
            >
              <p v-if="!editable" class="flex flex-col">
                <span class="text-ink-soft text-sm">{{ field.label.replace(' — необязательно', '') }}</span>
                <span>{{ profile[field.key] || "—" }}</span>
              </p>
              <UiInput
                v-else
                :model-value="profile[field.key]"
                :label="field.label"
                :autocomplete="field.auto"
                :hint="errors[field.key]"
                :invalid="!!errors[field.key]"
                @update:model-value="saveProfile(field.key, $event)"
              />
            </div>
          </div>
        </section>

        <section v-for="section in sections" :key="section.title" class="flex flex-col gap-3">
          <h2 class="font-display text-lg">{{ section.title }}</h2>
          <FormQuestion
            v-for="item in section.items"
            :key="item.question.id"
            :number="item.number"
            :question="item.question"
            :readonly="!editable"
            :error="errors[item.question.id]"
            :model-value="answers[item.question.id]"
            @update:model-value="saveAnswer(item.question.id, $event)"
          />
        </section>
      </template>
    </main>

    <!-- Нижняя панель: прогресс, автосохранение, отправка -->
    <div
      v-if="app && editable"
      class="border-line bg-card/95 fixed inset-x-0 bottom-0 border-t px-4 py-3 backdrop-blur"
      style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom))"
    >
      <div class="mx-auto flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center">
        <div class="flex flex-1 flex-col gap-1.5">
          <div class="flex items-center justify-between gap-3 text-sm">
            <span>Заполнено {{ filled }} из {{ total }}</span>
            <span class="text-ink-soft flex items-center gap-1.5" aria-live="polite">
              <template v-if="autosave.state.value === 'saving'">
                <LoaderCircle class="size-4 animate-spin" aria-hidden="true" /> Сохраняем…
              </template>
              <template v-else-if="autosave.state.value === 'error'">
                <CloudOff class="text-danger size-4" aria-hidden="true" />
                <span class="text-danger">{{ autosave.error.value }}</span>
              </template>
              <template v-else-if="autosave.state.value === 'saved'">
                <CloudCheck class="text-ok size-4" aria-hidden="true" /> Сохранено
              </template>
            </span>
          </div>
          <div class="bg-paper h-2 overflow-hidden rounded-full">
            <div
              class="bg-accent h-full rounded-full transition-all duration-500"
              :style="{ width: `${Math.round((filled / total) * 100)}%` }"
            />
          </div>
        </div>

        <div class="flex gap-2 sm:w-72">
          <template v-if="confirming">
            <UiButton variant="ghost" @click="confirming = false">Ещё проверю</UiButton>
            <UiButton :pending="submit.pending.value" @click="send">Отправить</UiButton>
          </template>
          <UiButton v-else @click="confirming = true">
            <Send class="size-5" aria-hidden="true" />
            Отправить анкету
          </UiButton>
        </div>
      </div>
      <p v-if="confirming" class="text-ink-soft mx-auto mt-2 max-w-3xl text-sm">
        После отправки ответы изменить нельзя.
      </p>
      <p
        v-else-if="submit.result.value && !submit.result.value.ok"
        class="text-danger mx-auto mt-2 max-w-3xl text-sm"
      >
        {{ submit.result.value.message }}
      </p>
    </div>
  </div>
</template>
