<script setup lang="ts">
import {
  BellRing,
  ChevronRight,
  MessageCircle,
  Smile,
  Trophy,
} from "lucide-vue-next";

import type { CandidateApplication } from "~~/lib/applications/candidate";
import type { CandidateAssessment } from "~~/lib/assessment/candidate";
import type { DailyStatus } from "~~/lib/games/daily";
import type { CandidateInterview } from "~~/lib/interviews/booking";

useHead({ title: "Кабинет" });

const user = await useSession();
const [
  { data },
  { data: application },
  { data: assessment, refresh: refreshAssessment },
  { data: interview },
  { data: daily },
] = await Promise.all([
  useFetch("/api/season"),
  useFetch("/api/cabinet/application"),
  useFetch<{ assessment: CandidateAssessment | null }>(
    "/api/cabinet/assessment",
  ),
  useFetch<{ interview: CandidateInterview | null }>("/api/cabinet/interview"),
  useFetch<DailyStatus>("/api/cabinet/daily"),
]);
const app = computed(
  () => application.value?.data as CandidateApplication | null | undefined,
);
const iv = computed(() => interview.value?.interview ?? null);
const co = computed(() => assessment.value?.assessment ?? null);

const HOUR = 60 * 60 * 1000;
const coOver = computed(() => {
  const startsAt = co.value?.invite?.day?.startsAt;
  return Boolean(
    startsAt && new Date(startsAt).getTime() + 4 * HOUR < Date.now(),
  );
});
const ivOver = computed(() =>
  Boolean(
    iv.value?.booking &&
    new Date(iv.value.booking.endsAt).getTime() < Date.now(),
  ),
);
const moment = (value: string | Date) =>
  `${mskFormat(value, "d MMMM")}, ${mskTime(value)}`;

/** Где по каждому этапу сам кандидат — для ленты этапов. */
const personal = computed(() => {
  const result: Record<
    string,
    { label: string; tone: "done" | "now" | "wait"; to?: string }
  > = {};
  const submitted = app.value?.application.status === "SUBMITTED";
  const stage = app.value?.stage;
  if (submitted)
    result.APPLICATION = {
      label: "Анкета отправлена",
      tone: "done",
      to: "/cabinet/application",
    };
  else if (stage?.state === "open")
    result.APPLICATION = {
      label: app.value?.application.id
        ? "Черновик — допишите"
        : "Заполните анкету",
      tone: "now",
      to: "/cabinet/application",
    };
  else if (stage?.state === "closed")
    result.APPLICATION = { label: "Не отправлена", tone: "wait" };

  if (submitted && co.value) {
    if (coOver.value)
      result.ASSESSMENT = { label: "Пройден — ждём итогов", tone: "done" };
    else if (co.value.invite && !co.value.invite.answer)
      result.ASSESSMENT = {
        label: "Приглашение — ответьте, будете ли",
        tone: "now",
        to: "/cabinet/assessment",
      };
    else if (co.value.invite?.reserveQueued)
      result.ASSESSMENT = {
        label: "В очереди на резервный день — ждите приглашения",
        tone: "wait",
        to: "/cabinet/assessment",
      };
    else if (co.value.invite?.day?.startsAt)
      result.ASSESSMENT = {
        label: `Ждём вас: ${moment(co.value.invite.day.startsAt)}`,
        tone: "now",
        to: "/cabinet/assessment",
      };
    else if (co.value.invite?.answer === "CANT")
      result.ASSESSMENT = {
        label: "Не сможете — организаторы свяжутся",
        tone: "wait",
        to: "/cabinet/assessment",
      };
    else if (co.value.state === "open")
      result.ASSESSMENT = { label: "Приглашение пришлём", tone: "wait" };
  }

  if (iv.value?.allowed) {
    if (ivOver.value || (iv.value.final && iv.value.booking))
      result.INTERVIEW = {
        label: "Пройдено — ждём итогов",
        tone: "done",
        to: "/cabinet/interview",
      };
    else if (iv.value.booking)
      result.INTERVIEW = {
        label: `Вы записаны: ${moment(iv.value.booking.startsAt)}`,
        tone: "now",
        to: "/cabinet/interview",
      };
    else if (iv.value.state === "open")
      result.INTERVIEW = {
        label: "Идёт запись — выберите время",
        tone: "now",
        to: "/cabinet/interview",
      };
    else if (iv.value.state === "closed")
      result.INTERVIEW = {
        label: "Запись закрыта",
        tone: "wait",
        to: "/cabinet/interview",
      };
  }

  if (iv.value?.final)
    result.RESULTS = {
      label: iv.value.final === "PASSED" ? "Вы в Школе! 🎉" : "Итоги объявлены",
      tone: "done",
      to: "/cabinet/interview",
    };
  else if (
    submitted &&
    (ivOver.value ||
      data.value?.season?.stages.some(
        (item) => item.kind === "RESULTS" && item.state !== "upcoming",
      ))
  )
    result.RESULTS = { label: "Ждём итогов", tone: "wait" };
  return result;
});
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
      <div class="flex flex-col gap-2">
        <h1 class="font-display text-2xl sm:text-3xl">
          {{
            user?.firstName
              ? `Здравствуйте, ${user.firstName}!`
              : "Здравствуйте!"
          }}
        </h1>
        <p class="text-ink-soft">
          Вы зарегистрированы на отбор. Анкета, домашнее задание, центр оценки и
          собеседование открываются здесь по очереди — каждый шаг в свой срок.
        </p>
      </div>

      <AppInterviewCard
        v-if="
          iv &&
          (iv.final || (iv.allowed && (iv.booking || iv.state !== 'upcoming')))
        "
        :iv="iv"
      />
      <AppAssessmentCard
        v-if="co && (co.invite || co.state === 'open')"
        :co="co"
        @changed="refreshAssessment"
      />
      <AppApplicationCard v-if="app" :app="app" />

      <NuxtLink
        to="/cabinet/daily"
        class="bg-brand-yellow-soft border-ink/10 group flex items-center gap-4 rounded-3xl border p-5 transition hover:-translate-y-0.5"
      >
        <span class="flex flex-1 flex-col gap-1">
          <span class="font-display text-xl">Задание дня</span>
          <span class="text-ink/75 text-sm">
            {{
              daily?.solved
                ? `Решено. Серия: ${daily.streak} — возвращайтесь завтра.`
                : "Одна головоломка в день. Решите — и серия растёт."
            }}
          </span>
        </span>
        <ChevronRight class="size-5 shrink-0" aria-hidden="true" />
      </NuxtLink>

      <NuxtLink
        to="/cabinet/games"
        class="bg-brand-purple-soft border-ink/10 group relative flex items-center gap-4 overflow-hidden rounded-3xl border p-5 transition hover:-translate-y-0.5"
      >
        <span class="flex flex-1 flex-col gap-1">
          <span class="font-display text-xl">Мини-игры</span>
          <span class="text-ink/75 text-sm"
            >Короткие игры с героями Школы и задание дня с серией.</span
          >
        </span>
        <span class="flex shrink-0 -space-x-4" aria-hidden="true">
          <img
            src="/brand/mascots/green.webp"
            alt=""
            class="w-14 -rotate-12 transition group-hover:-rotate-3"
          >
          <img
            src="/brand/mascots/orange.webp"
            alt=""
            class="w-14 rotate-6 transition group-hover:rotate-12"
          >
        </span>
        <ChevronRight class="size-5 shrink-0" aria-hidden="true" />
      </NuxtLink>

      <div class="grid gap-3 sm:grid-cols-2">
        <NuxtLink
          to="/cabinet/profile"
          class="bg-card border-line hover:border-ink-soft flex items-center gap-3 rounded-3xl border p-4 transition"
        >
          <span
            class="bg-brand-green-soft grid size-11 place-items-center rounded-2xl"
            ><Smile class="size-5" aria-hidden="true"
          /></span>
          <span class="flex-1">
            <span class="block font-semibold">Профиль</span>
            <span class="text-ink-soft block text-sm"
              >Ник и аватарка для рейтинга</span
            >
          </span>
        </NuxtLink>
        <NuxtLink
          to="/cabinet/rating"
          class="bg-card border-line hover:border-ink-soft flex items-center gap-3 rounded-3xl border p-4 transition"
        >
          <span
            class="bg-brand-orange-soft grid size-11 place-items-center rounded-2xl"
            ><Trophy class="size-5" aria-hidden="true"
          /></span>
          <span class="flex-1">
            <span class="block font-semibold">Рейтинг</span>
            <span class="text-ink-soft block text-sm"
              >Общий зачёт мини-игр</span
            >
          </span>
        </NuxtLink>
        <NuxtLink
          to="/cabinet/messages"
          class="bg-card border-line hover:border-ink-soft flex items-center gap-3 rounded-3xl border p-4 transition"
        >
          <span
            class="bg-brand-purple-soft grid size-11 place-items-center rounded-2xl"
            ><MessageCircle class="size-5" aria-hidden="true"
          /></span>
          <span class="flex-1">
            <span class="block font-semibold">Сообщения</span>
            <span class="text-ink-soft block text-sm"
              >Вопрос организаторам</span
            >
          </span>
        </NuxtLink>
        <NuxtLink
          to="/cabinet/settings"
          class="bg-card border-line hover:border-ink-soft flex items-center gap-3 rounded-3xl border p-4 transition"
        >
          <span
            class="bg-brand-yellow-soft grid size-11 place-items-center rounded-2xl"
            ><BellRing class="size-5" aria-hidden="true"
          /></span>
          <span class="flex-1">
            <span class="block font-semibold">Уведомления</span>
            <span class="text-ink-soft block text-sm">Telegram и пуши</span>
          </span>
        </NuxtLink>
      </div>

      <section v-if="data?.season" class="flex flex-col gap-3">
        <h2 class="font-display text-lg">Этапы отбора</h2>
        <AppStageTimeline :stages="data.season.stages" :personal="personal" />
      </section>

      <UiButton v-if="user?.isStaff" href="/staff" variant="ghost"
        >Перейти в кабинет организатора</UiButton
      >
    </main>
  </div>
</template>
