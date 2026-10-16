<script setup lang="ts">
import { ArrowRight } from "lucide-vue-next";

import type { ActionResult } from "~/composables/useAction";
import { COURSES, FACULTIES, type CredentialsField, type OnboardingField } from "~~/lib/profile/onboarding";

/**
 * «Давай познакомимся» — один раз после первого входа, до кабинета, анкеты
 * и теста. Имя и фамилия уже из Telegram; группа и VK — потом, в анкете.
 * Пришёл через Telegram без пароля — здесь же логин, почта и пароль:
 * дальше можно входить и без Telegram.
 * Дальше — куда шёл (?next=), в Mini App — сразу к тесту.
 */
useHead({ title: "Давай познакомимся" });

interface Known {
  lastName: string;
  firstName: string;
  middleName: string;
  course: string;
  faculty: string;
  studentId: string;
  phone: string;
  done: boolean;
  needsCredentials: boolean;
  login: string;
  email: string;
}

const route = useRoute();
const { data } = await useFetch<Known>("/api/cabinet/onboarding");

const form = reactive({
  lastName: data.value?.lastName ?? "",
  firstName: data.value?.firstName ?? "",
  middleName: data.value?.middleName ?? "",
  course: data.value?.course ?? "",
  faculty: data.value?.faculty ?? "",
  studentId: data.value?.studentId ?? "",
  phone: data.value?.phone ?? "",
  login: data.value?.login ?? "",
  email: data.value?.email ?? "",
  password: "",
  repeat: "",
});
const needsCredentials = computed(() => data.value?.needsCredentials ?? false);

const errors = ref<Partial<Record<OnboardingField | CredentialsField, string>>>({});
const pending = ref(false);
const problem = ref<string | null>(null);

watch(form, () => {
  if (Object.keys(errors.value).length) errors.value = {};
});

async function save() {
  pending.value = true;
  problem.value = null;
  try {
    const result = await $fetch<ActionResult>("/api/cabinet/onboarding", { method: "POST", body: { ...form }, ignoreResponseError: true }).catch(
      (): ActionResult => ({ ok: false, message: "Нет связи с сайтом. Проверьте интернет и нажмите ещё раз." }),
    );
    if (!result.ok) {
      const problems = (result.problems as { field: OnboardingField | CredentialsField; message: string }[] | undefined) ?? [];
      errors.value = Object.fromEntries(problems.map((item) => [item.field, item.message]));
      problem.value = problems.length ? "Проверьте выделенные поля." : (result.message ?? "Не получилось сохранить.");
      await nextTick();
      document.querySelector("[aria-invalid='true'], [data-invalid]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    await refreshSession();
    const next = typeof route.query.next === "string" && route.query.next.startsWith("/") && !route.query.next.startsWith("//") ? route.query.next : "/cabinet";
    await navigateTo(next, { replace: true });
  } finally {
    pending.value = false;
  }
}

const chip = (active: boolean, invalid: boolean) =>
  active ? "border-accent bg-accent text-accent-ink" : invalid ? "border-danger bg-card" : "border-line bg-card hover:border-accent/50";
</script>

<template>
  <main class="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 py-8">
    <div class="flex items-center gap-3">
      <img src="/brand/mascots/green.webp" alt="" class="w-16">
      <div class="flex flex-col gap-1">
        <h1 class="font-display text-3xl">Давай познакомимся</h1>
        <p class="text-ink-soft text-sm">Один раз — и дальше всё подставится само: в тест, анкету и запись на этапы.</p>
      </div>
    </div>

    <form class="flex flex-col gap-5" novalidate @submit.prevent="save">
      <div class="grid gap-4">
        <UiInput v-model="form.lastName" label="Фамилия" autocomplete="family-name" :hint="errors.lastName" :invalid="!!errors.lastName" />
        <UiInput v-model="form.firstName" label="Имя" autocomplete="given-name" :hint="errors.firstName" :invalid="!!errors.firstName" />
        <UiInput
          v-model="form.middleName"
          label="Отчество — если есть"
          autocomplete="additional-name"
          :hint="errors.middleName"
          :invalid="!!errors.middleName"
        />
      </div>

      <fieldset class="flex flex-col gap-2" :data-invalid="errors.course ? '' : undefined">
        <legend class="mb-1 text-sm font-medium">Курс бакалавриата</legend>
        <div role="radiogroup" aria-label="Курс" class="grid grid-cols-2 gap-2">
          <button
            v-for="course in COURSES"
            :key="course"
            type="button"
            role="radio"
            :aria-checked="form.course === course"
            class="min-h-12 rounded-2xl border font-semibold transition"
            :class="chip(form.course === course, !!errors.course)"
            @click="form.course = course"
          >
            {{ course }} курс
          </button>
        </div>
        <p v-if="errors.course" class="text-danger text-sm">{{ errors.course }}</p>
      </fieldset>

      <fieldset class="flex flex-col gap-2" :data-invalid="errors.faculty ? '' : undefined">
        <legend class="mb-1 text-sm font-medium">Факультет</legend>
        <div role="radiogroup" aria-label="Факультет" class="grid grid-cols-4 gap-2">
          <button
            v-for="faculty in FACULTIES"
            :key="faculty"
            type="button"
            role="radio"
            :aria-checked="form.faculty === faculty"
            class="min-h-12 rounded-2xl border px-1 text-sm font-semibold transition"
            :class="chip(form.faculty === faculty, !!errors.faculty)"
            @click="form.faculty = faculty"
          >
            {{ faculty }}
          </button>
        </div>
        <p v-if="errors.faculty" class="text-danger text-sm">{{ errors.faculty }}</p>
      </fieldset>

      <div class="grid gap-4">
        <UiInput
          v-model="form.studentId"
          label="Номер студенческого билета"
          inputmode="numeric"
          autocomplete="off"
          placeholder="Только цифры"
          :hint="errors.studentId"
          :invalid="!!errors.studentId"
        />
        <UiInput
          v-model="form.phone"
          label="Телефон"
          type="tel"
          autocomplete="tel"
          placeholder="+7 999 123-45-67"
          :hint="errors.phone"
          :invalid="!!errors.phone"
        />
      </div>

      <fieldset v-if="needsCredentials" class="bg-card border-line flex flex-col gap-4 rounded-3xl border p-4">
        <legend class="px-1 text-sm font-semibold">Данные для входа</legend>
        <p class="text-ink-soft -mt-1 text-sm">Чтобы входить и без Telegram: по логину или почте и паролю.</p>
        <UiInput
          v-model="form.login"
          label="Логин"
          autocomplete="username"
          placeholder="Латиница и цифры, например anna.k"
          :hint="errors.login"
          :invalid="!!errors.login"
        />
        <UiInput
          v-model="form.email"
          label="Почта"
          type="email"
          inputmode="email"
          autocomplete="email"
          placeholder="name@mail.ru"
          :hint="errors.email"
          :invalid="!!errors.email"
        />
        <UiInput
          v-model="form.password"
          label="Пароль — от 8 знаков"
          type="password"
          autocomplete="new-password"
          :hint="errors.password"
          :invalid="!!errors.password"
        />
        <UiInput
          v-model="form.repeat"
          label="Пароль ещё раз"
          type="password"
          autocomplete="new-password"
          :hint="errors.repeat"
          :invalid="!!errors.repeat"
        />
      </fieldset>

      <UiNotice :message="problem" />
      <UiButton type="submit" :pending="pending">Готово <ArrowRight class="size-5" aria-hidden="true" /></UiButton>
    </form>
  </main>
</template>
