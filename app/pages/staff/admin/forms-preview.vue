<script setup lang="ts">
import { submitProblems, type AnswerValue } from "~~/lib/applications/form";

/**
 * Анкета глазами кандидата: те же шаги, проверки и страница отправки, но
 * ответы живут только в этой вкладке — ничего не сохраняется и не уходит.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Анкета глазами кандидата" });

type Format = "DIGITS" | "GROUP" | "PHONE" | "VK" | "TELEGRAM";
interface Editor {
  sections: { id: string; title: string; description: string | null; homework: boolean }[];
  questions: {
    id: string;
    section: string;
    type: "SHORT_TEXT" | "LONG_TEXT" | "SINGLE_CHOICE" | "MULTI_CHOICE" | "URL";
    label: string;
    help: string | null;
    required: boolean;
    options: string[];
    maxLength: number | null;
    minLength: number | null;
    format: Format | null;
  }[];
}

const { data } = await useFetch<Editor>("/api/admin/forms");

const answers = ref<Record<string, AnswerValue>>({});
const profile = reactive({ lastName: "", firstName: "", middleName: "", studentId: "" });

async function send() {
  const problems = submitProblems(data.value?.questions ?? [], answers.value, profile);
  if (problems.length) return { ok: false, message: problems[0]!.message, problems };
  return { ok: false, message: "Всё заполнено верно. Это предпросмотр — анкета никуда не отправляется." };
}
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
    <NuxtLink to="/staff/admin/forms" class="text-ink-soft hover:text-ink text-sm">← Анкета и оценка</NuxtLink>
    <div class="bg-brand-yellow-soft rounded-3xl p-4 text-sm">
      Так анкету видит кандидат. Ответы здесь не сохраняются — можно пробовать что угодно.
    </div>
    <FormWizard
      v-if="data"
      :questions="data.questions"
      :sections="data.sections"
      :answers="answers"
      :profile="profile"
      :flush="async () => {}"
      :send="send"
      @answer="(id, value) => (answers[id] = value ?? '')"
      @profile="(field, value) => (profile[field] = value)"
    />
  </main>
</template>
