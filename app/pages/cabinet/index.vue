<script setup lang="ts">
import { BellRing, ChevronRight, MessageCircle, Smile, Trophy } from "lucide-vue-next";

import type { CandidateApplication } from "~~/lib/applications/candidate";
import type { HomeworkView } from "~~/lib/applications/homework";
import type { DailyStatus } from "~~/lib/games/daily";
import type { CandidateInterview } from "~~/lib/interviews/booking";

useHead({ title: "Кабинет" });

const user = await useSession();
const [{ data }, { data: application }, { data: homework }, { data: interview }, { data: daily }] = await Promise.all([
  useFetch("/api/season"),
  useFetch("/api/cabinet/application"),
  useFetch<{ homework: HomeworkView | null }>("/api/cabinet/homework"),
  useFetch<{ interview: CandidateInterview | null }>("/api/cabinet/interview"),
  useFetch<DailyStatus>("/api/cabinet/daily"),
]);
const app = computed(() => application.value?.data as CandidateApplication | null | undefined);
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-8">
      <div class="flex flex-col gap-2">
        <h1 class="font-display text-2xl sm:text-3xl">
          {{ user?.firstName ? `Здравствуйте, ${user.firstName}!` : "Здравствуйте!" }}
        </h1>
        <p class="text-ink-soft">
          Вы зарегистрированы на отбор. Анкета, домашнее задание и запись на собеседование открываются
          здесь по очереди — каждый шаг в свой срок.
        </p>
      </div>

      <AppInterviewCard v-if="interview?.interview && (interview.interview.admission || interview.interview.final)" :iv="interview.interview" />
      <AppHomeworkCard v-if="homework?.homework && homework.homework.admission" :hw="homework.homework" />
      <AppApplicationCard v-if="app" :app="app" :admission="homework?.homework?.admission ?? null" />

      <NuxtLink
        to="/cabinet/daily"
        class="bg-brand-yellow-soft border-ink/10 group flex items-center gap-4 rounded-3xl border p-5 transition hover:-translate-y-0.5"
      >
        <span class="flex flex-1 flex-col gap-1">
          <span class="font-display text-xl">Задание дня</span>
          <span class="text-ink/75 text-sm">
            {{ daily?.solved ? `Решено. Серия: ${daily.streak} — возвращайтесь завтра.` : "Одна головоломка в день. Решите — и серия растёт." }}
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
          <span class="text-ink/75 text-sm">Короткие игры с героями Школы и задание дня с серией.</span>
        </span>
        <span class="flex shrink-0 -space-x-4" aria-hidden="true">
          <img src="/brand/mascots/green.webp" alt="" class="w-14 -rotate-12 transition group-hover:-rotate-3">
          <img src="/brand/mascots/orange.webp" alt="" class="w-14 rotate-6 transition group-hover:rotate-12">
        </span>
        <ChevronRight class="size-5 shrink-0" aria-hidden="true" />
      </NuxtLink>

      <div class="grid gap-3 sm:grid-cols-2">
        <NuxtLink to="/cabinet/profile" class="bg-card border-line hover:border-ink-soft flex items-center gap-3 rounded-3xl border p-4 transition">
          <span class="bg-brand-green-soft grid size-11 place-items-center rounded-2xl"><Smile class="size-5" aria-hidden="true" /></span>
          <span class="flex-1">
            <span class="block font-semibold">Профиль</span>
            <span class="text-ink-soft block text-sm">Ник и аватарка для рейтинга</span>
          </span>
        </NuxtLink>
        <NuxtLink to="/cabinet/rating" class="bg-card border-line hover:border-ink-soft flex items-center gap-3 rounded-3xl border p-4 transition">
          <span class="bg-brand-orange-soft grid size-11 place-items-center rounded-2xl"><Trophy class="size-5" aria-hidden="true" /></span>
          <span class="flex-1">
            <span class="block font-semibold">Рейтинг</span>
            <span class="text-ink-soft block text-sm">Общий зачёт мини-игр</span>
          </span>
        </NuxtLink>
        <NuxtLink to="/cabinet/messages" class="bg-card border-line hover:border-ink-soft flex items-center gap-3 rounded-3xl border p-4 transition">
          <span class="bg-brand-purple-soft grid size-11 place-items-center rounded-2xl"><MessageCircle class="size-5" aria-hidden="true" /></span>
          <span class="flex-1">
            <span class="block font-semibold">Сообщения</span>
            <span class="text-ink-soft block text-sm">Вопрос организаторам</span>
          </span>
        </NuxtLink>
        <NuxtLink to="/cabinet/settings" class="bg-card border-line hover:border-ink-soft flex items-center gap-3 rounded-3xl border p-4 transition">
          <span class="bg-brand-yellow-soft grid size-11 place-items-center rounded-2xl"><BellRing class="size-5" aria-hidden="true" /></span>
          <span class="flex-1">
            <span class="block font-semibold">Уведомления</span>
            <span class="text-ink-soft block text-sm">Telegram и пуши</span>
          </span>
        </NuxtLink>
      </div>

      <section v-if="data?.season" class="flex flex-col gap-3">
        <h2 class="font-display text-lg">Этапы отбора</h2>
        <AppStageTimeline :stages="data.season.stages" />
      </section>

      <UiButton v-if="user?.isStaff" href="/staff" variant="ghost">Перейти в кабинет организатора</UiButton>
    </main>
  </div>
</template>
