<script setup lang="ts">
import { ArrowLeft, ArrowRight, CloudCheck, CloudOff, LoaderCircle, Pencil, Send } from "lucide-vue-next";

import { stepProblems, type AnswerValue, type SubmitProblem } from "~~/lib/applications/form";

/**
 * Анкета по шагам, как в Google Forms: раздел за экран — название,
 * описание, вопросы; «Назад» и «Далее». «Далее» проверяет раздел теми же
 * правилами, что и отправка, и не пускает дальше с ошибками. Последний
 * шаг — все ответы целиком и «Отправить».
 *
 * Шаг — в адресе (?step=2): обновление и «назад» браузера ведут туда же.
 * Без шага в адресе — первый раздел, где что-то не заполнено.
 *
 * Сохранять и отправлять умеет родитель: кабинет — на сервер, предпросмотр
 * организатора — никуда.
 *
 * Дополнительный шаг (extraStep) — после разделов, до проверки: так в анкету
 * встроено домашнее задание. Его содержимое рисует родитель в слоте #extra,
 * строку на странице проверки — в #extra-summary; «Далее» пускает дальше,
 * только когда extraStep.done.
 */
interface Question {
  id: string;
  section: string;
  type: "SHORT_TEXT" | "LONG_TEXT" | "SINGLE_CHOICE" | "MULTI_CHOICE" | "URL";
  label: string;
  help: string | null;
  required: boolean;
  options: string[];
  maxLength: number | null;
  minLength: number | null;
  format: "DIGITS" | "GROUP" | "PHONE" | "VK" | "TELEGRAM" | null;
}
interface Profile {
  lastName: string;
  firstName: string;
  middleName: string;
  studentId: string;
}
type ProfileField = keyof Profile;
interface SendResult {
  ok: boolean;
  message?: string;
  problems?: SubmitProblem[];
}

const props = defineProps<{
  questions: Question[];
  sections: { title: string; description: string | null }[];
  answers: Record<string, AnswerValue>;
  profile: Profile;
  saveState?: "idle" | "saving" | "saved" | "error";
  saveError?: string | null;
  sending?: boolean;
  /** Дождаться автосохранения — перед проверкой шага. */
  flush: () => Promise<void>;
  extraStep?: { title: string; description: string | null; done: boolean; problem: string } | null;
  send: () => Promise<SendResult>;
}>();
const emit = defineEmits<{ answer: [id: string, value: AnswerValue | undefined]; profile: [field: ProfileField, value: string] }>();

const PROFILE_FIELDS = [
  { key: "lastName", label: "Фамилия", auto: "family-name", mode: "text" },
  { key: "firstName", label: "Имя", auto: "given-name", mode: "text" },
  { key: "middleName", label: "Отчество — необязательно", auto: "additional-name", mode: "text" },
  { key: "studentId", label: "Номер студенческого билета", auto: "off", mode: "numeric" },
] as const;

// Шаги: разделы с вопросами; ФИО и студенческий — в первом.
const steps = computed(() => {
  let number = 0;
  return props.sections
    .map((section, index) => {
      const questions = props.questions.filter((question) => question.section === section.title);
      const items = questions.map((question) => ({ question, number: ++number }));
      const fields = [...(index === 0 ? PROFILE_FIELDS.map((field) => field.key) : []), ...questions.map((q) => q.id)];
      return { ...section, items, fields, withProfile: index === 0 };
    })
    .filter((step) => step.items.length > 0 || step.withProfile)
    .map((step) => ({ ...step, extra: false }));
});
// Разделы плюс дополнительный шаг (домашка) — в одном списке.
const allSteps = computed(() =>
  props.extraStep
    ? [
        ...steps.value,
        {
          title: props.extraStep.title,
          description: props.extraStep.description,
          items: [],
          fields: ["homework"],
          withProfile: false,
          extra: true,
        },
      ]
    : steps.value,
);
const total = computed(() => allSteps.value.length);

const route = useRoute();
const router = useRouter();
const errors = ref<Record<string, string>>({});
// Домашку прикрепили — ошибка шага уходит сама.
watch(
  () => props.extraStep?.done,
  (done) => {
    if (done && errors.value.homework) errors.value = Object.fromEntries(Object.entries(errors.value).filter(([key]) => key !== "homework"));
  },
);

function problemsOf(index: number): SubmitProblem[] {
  const step = allSteps.value[index];
  if (!step) return [];
  if (step.extra) return props.extraStep?.done ? [] : [{ field: "homework", message: props.extraStep?.problem ?? "Заполните этот шаг." }];
  return stepProblems(props.questions, props.answers, props.profile, step.fields);
}

// Без шага в адресе — первый незаполненный раздел, всё заполнено — проверка.
function firstOpenStep() {
  const open = allSteps.value.findIndex((_, index) => problemsOf(index).length > 0);
  return open === -1 ? total.value : open;
}

// Стартовый шаг считаем один раз: иначе, пока человек печатает, анкета
// перескакивала бы на следующий незаполненный раздел сама.
const initial = firstOpenStep();
const current = computed(() => {
  const raw = Number(route.query.step);
  if (Number.isInteger(raw) && raw >= 1 && raw <= total.value + 1) return raw - 1;
  return initial;
});
onMounted(() => {
  if (!route.query.step) router.replace({ query: { ...route.query, step: String(initial + 1) } });
});
const reviewing = computed(() => current.value >= total.value);
const step = computed(() => allSteps.value[current.value]);

async function go(index: number) {
  errors.value = {};
  await router.push({ query: { ...route.query, step: String(index + 1) } });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showProblems(problems: SubmitProblem[]) {
  errors.value = Object.fromEntries(problems.map((problem) => [problem.field, problem.message]));
  const first = problems[0];
  if (!first) return;
  nextTick(() => {
    const target = document.getElementById(first.field === "homework" ? "wizard-extra" : first.field in props.profile ? `p-${first.field}` : `q-${first.field}`);
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

const checking = ref(false);
async function next() {
  checking.value = true;
  try {
    await props.flush();
    const problems = problemsOf(current.value);
    if (problems.length > 0) return showProblems(problems);
    await go(current.value + 1);
  } finally {
    checking.value = false;
  }
}

function setAnswer(id: string, value: AnswerValue | undefined) {
  if (id in errors.value) errors.value = Object.fromEntries(Object.entries(errors.value).filter(([key]) => key !== id));
  emit("answer", id, value);
}
function setProfile(field: ProfileField, value: string) {
  if (field in errors.value) errors.value = Object.fromEntries(Object.entries(errors.value).filter(([key]) => key !== field));
  emit("profile", field, value);
}

// --- Проверка и отправка ------------------------------------------------------
const confirming = ref(false);
const sendProblem = ref<string | null>(null);

// Раздел, где что-то не так, — для ссылки «Исправить» на странице проверки.
const brokenSteps = computed(() => allSteps.value.map((_, index) => problemsOf(index).length > 0));

async function submit() {
  sendProblem.value = null;
  await props.flush();
  const result = await props.send();
  confirming.value = false;
  if (result.ok) return;
  sendProblem.value = result.message ?? "Не получилось отправить. Попробуйте ещё раз.";
  const field = result.problems?.[0]?.field;
  const index = field ? allSteps.value.findIndex((item) => item.fields.includes(field)) : -1;
  if (index !== -1) {
    await go(index);
    showProblems(result.problems!.filter((problem) => allSteps.value[index]!.fields.includes(problem.field)));
  }
}

const shown = (value: AnswerValue | undefined) => (Array.isArray(value) ? value.join(", ") : (value ?? "")) || "Нет ответа";
</script>

<template>
  <div class="flex flex-col gap-6">
    <!-- Где я -->
    <div class="flex flex-col gap-2">
      <div class="text-ink-soft flex items-center justify-between gap-3 text-sm">
        <span>{{ reviewing ? "Проверка перед отправкой" : `Шаг ${current + 1} из ${total}` }}</span>
        <span class="flex items-center gap-1.5" aria-live="polite">
          <template v-if="saveState === 'saving'"><LoaderCircle class="size-4 animate-spin" aria-hidden="true" /> Сохраняем…</template>
          <template v-else-if="saveState === 'error'">
            <CloudOff class="text-danger size-4" aria-hidden="true" /><span class="text-danger">{{ saveError }}</span>
          </template>
          <template v-else-if="saveState === 'saved'"><CloudCheck class="text-ok size-4" aria-hidden="true" /> Сохранено</template>
        </span>
      </div>
      <div class="bg-card border-line flex gap-1 rounded-full border p-1" aria-hidden="true">
        <span
          v-for="index in total + 1"
          :key="index"
          class="h-1.5 flex-1 rounded-full transition-colors"
          :class="index - 1 <= current ? 'bg-accent' : 'bg-paper'"
        />
      </div>
    </div>

    <!-- Раздел -->
    <section v-if="!reviewing && step" class="flex flex-col gap-4" :aria-label="step.title">
      <div class="flex flex-col gap-2">
        <h2 class="font-display text-2xl">{{ step.title }}</h2>
        <p v-if="step.description" class="text-ink-soft whitespace-pre-line">{{ step.description }}</p>
      </div>

      <div v-if="step.withProfile" class="bg-card border-line grid gap-4 rounded-3xl border p-4 sm:grid-cols-2 sm:p-5">
        <div v-for="field in PROFILE_FIELDS" :id="`p-${field.key}`" :key="field.key">
          <UiInput
            :model-value="profile[field.key]"
            :label="field.label"
            :autocomplete="field.auto"
            :inputmode="field.mode"
            :hint="errors[field.key]"
            :invalid="!!errors[field.key]"
            @update:model-value="setProfile(field.key, $event)"
          />
        </div>
      </div>

      <div v-if="step.extra" id="wizard-extra" class="flex flex-col gap-2">
        <slot name="extra" />
        <p v-if="errors.homework" class="text-danger text-sm" role="alert">{{ errors.homework }}</p>
      </div>

      <FormQuestion
        v-for="item in step.items"
        :key="item.question.id"
        :number="item.number"
        :question="item.question"
        :error="errors[item.question.id]"
        :model-value="answers[item.question.id]"
        @update:model-value="setAnswer(item.question.id, $event)"
      />

      <div class="flex gap-2">
        <div v-if="current > 0" class="w-40 shrink-0">
          <UiButton variant="ghost" @click="go(current - 1)"><ArrowLeft class="size-5" aria-hidden="true" /> Назад</UiButton>
        </div>
        <UiButton :pending="checking" @click="next">
          {{ current + 1 === total ? "Проверить ответы" : "Далее" }} <ArrowRight class="size-5" aria-hidden="true" />
        </UiButton>
      </div>
    </section>

    <!-- Проверка -->
    <section v-else class="flex flex-col gap-4" aria-label="Проверка ответов">
      <div class="flex flex-col gap-2">
        <h2 class="font-display text-2xl">Проверь ответы</h2>
        <p class="text-ink-soft">После отправки изменить их будет нельзя.</p>
      </div>

      <article
        v-for="(item, index) in allSteps"
        :key="item.title"
        class="bg-card flex flex-col gap-3 rounded-3xl border p-4 sm:p-5"
        :class="brokenSteps[index] ? 'border-danger' : 'border-line'"
      >
        <div class="flex items-start justify-between gap-3">
          <h3 class="font-display text-lg">{{ item.title }}</h3>
          <button type="button" class="text-accent flex shrink-0 items-center gap-1 text-sm font-medium hover:underline" @click="go(index)">
            <Pencil class="size-4" aria-hidden="true" /> {{ brokenSteps[index] ? "Исправить" : "Изменить" }}
          </button>
        </div>
        <dl class="flex flex-col gap-3 text-sm">
          <template v-if="item.withProfile">
            <div>
              <dt class="text-ink-soft">ФИО</dt>
              <dd>{{ [profile.lastName, profile.firstName, profile.middleName].filter(Boolean).join(" ") || "—" }}</dd>
            </div>
            <div>
              <dt class="text-ink-soft">Студенческий билет</dt>
              <dd>{{ profile.studentId || "—" }}</dd>
            </div>
          </template>
          <slot v-if="item.extra" name="extra-summary" />
          <div v-for="entry in item.items" :key="entry.question.id">
            <dt class="text-ink-soft">{{ entry.number }}. {{ entry.question.label }}</dt>
            <dd class="whitespace-pre-line break-words">{{ shown(answers[entry.question.id]) }}</dd>
          </div>
        </dl>
      </article>

      <UiNotice :message="sendProblem" />

      <div class="flex flex-col gap-2 sm:flex-row">
        <div class="sm:w-40 sm:shrink-0">
          <UiButton variant="ghost" @click="go(total - 1)"><ArrowLeft class="size-5" aria-hidden="true" /> Назад</UiButton>
        </div>
        <template v-if="confirming">
          <UiButton variant="ghost" @click="confirming = false">Ещё проверю</UiButton>
          <UiButton :pending="sending" @click="submit">Да, отправить</UiButton>
        </template>
        <UiButton v-else @click="confirming = true"><Send class="size-5" aria-hidden="true" /> Отправить анкету</UiButton>
      </div>
    </section>
  </div>
</template>
