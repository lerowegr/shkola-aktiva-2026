<script setup lang="ts">
import { ArrowLeft, CalendarClock, ChevronDown, CircleCheck, MapPin } from "lucide-vue-next";

import type { StaffCriterion, StaffReview } from "~~/lib/applications/staff";
import { placeLine } from "~~/lib/assessment/rules";

/**
 * Экран группы ЦО: все кандидаты группы на одной странице. Слева —
 * переключатель кандидатов с отметкой «оценён», справа — своя оценка
 * и, ниже, оценки других экспертов только для чтения.
 *
 * Панели рисуются все сразу и прячутся v-show: панель оценки ждёт сессию
 * в setup, и появившаяся после загрузки зависла бы в Suspense. Заодно
 * переключение между кандидатами мгновенное и не теряет набранное.
 */
definePageMeta({ layout: "staff" });

interface Sheet {
  id: string;
  title: string;
  building: string | null;
  room: string | null;
  startsAt: string | null;
  note: string | null;
  experts: { id: string; name: string }[];
  criteria: StaffCriterion[];
  markers: { id: string; title: string; example: string | null }[];
  members: { applicationId: string; name: string; reviews: StaffReview[] }[];
}

const route = useRoute();
const router = useRouter();
const { data, refresh, error } = await useFetch<{ sheet: Sheet; isExpert: boolean; manage: boolean }>(
  () => `/api/staff/assessment/${route.params.id}`,
);
useHead({ title: () => data.value?.sheet.title ?? "Группа ЦО" });

const sheet = computed(() => data.value?.sheet ?? null);
const selected = computed(() => {
  const members = sheet.value?.members ?? [];
  return members.find((member) => member.applicationId === route.query.m) ?? members[0] ?? null;
});
function pick(applicationId: string) {
  void router.replace({ query: { ...route.query, m: applicationId } });
  if (window.innerWidth < 1024) document.getElementById("co-sheet")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const card = computed(() => ({ stage: "ASSESSMENT" as const, criteria: sheet.value?.criteria ?? [], markers: sheet.value?.markers ?? [] }));
const mine = (member: Sheet["members"][number]) => member.reviews.find((review) => review.isMine) ?? null;
const done = (member: Sheet["members"][number]) => mine(member)?.summary.status === "done";
const doneCount = computed(() => (sheet.value?.members ?? []).filter(done).length);

// Отметки «оценён» — по свежим данным, но не на каждое нажатие.
let timer: ReturnType<typeof setTimeout> | null = null;
function changed() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void refresh();
    void refreshNuxtData("staff-nav");
  }, 1500);
}
onBeforeUnmount(() => timer && clearTimeout(timer));
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <NuxtLink to="/staff/assessment" class="text-ink-soft hover:text-ink flex items-center gap-1 text-sm">
      <ArrowLeft class="size-4" aria-hidden="true" /> Центр оценки
    </NuxtLink>

    <p v-if="error" class="bg-card border-line rounded-3xl border p-5 text-sm">
      {{ error.statusMessage || "Группа недоступна." }}
    </p>

    <template v-if="sheet">
      <div class="flex flex-col gap-2">
        <h1 class="font-display text-3xl">{{ sheet.title }}</h1>
        <div class="text-ink-soft flex flex-col gap-1 text-sm sm:flex-row sm:gap-4">
          <span v-if="sheet.building || sheet.room" class="flex items-center gap-1.5"><MapPin class="size-4" aria-hidden="true" />{{ placeLine(sheet) }}</span>
          <span v-if="sheet.startsAt" class="flex items-center gap-1.5">
            <CalendarClock class="size-4" aria-hidden="true" />{{ mskDay(sheet.startsAt) }}, {{ mskTime(sheet.startsAt) }} МСК
          </span>
          <span>Эксперты: {{ sheet.experts.map((expert) => expert.name).join(", ") || "не назначены" }}</span>
        </div>
        <p v-if="data?.isExpert" class="text-sm">Вы оценили полностью: <b>{{ doneCount }} из {{ sheet.members.length }}</b></p>
        <p v-else class="text-ink-soft text-sm">Вы не эксперт этой группы — оценки только для просмотра.</p>
      </div>

      <p v-if="sheet.members.length === 0" class="bg-card border-line text-ink-soft rounded-3xl border p-5 text-sm">
        В группе пока нет кандидатов.
      </p>

      <div v-else class="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <nav aria-label="Кандидаты группы" class="lg:sticky lg:top-4 lg:self-start">
          <ul class="bg-card border-line flex flex-col gap-1 rounded-3xl border p-2">
            <li v-for="(member, index) in sheet.members" :key="member.applicationId">
              <button
                type="button"
                class="flex min-h-11 w-full items-center gap-2.5 rounded-2xl px-3 text-left text-sm transition"
                :class="selected?.applicationId === member.applicationId ? 'bg-accent text-accent-ink' : 'hover:bg-paper'"
                :aria-current="selected?.applicationId === member.applicationId ? 'true' : undefined"
                @click="pick(member.applicationId)"
              >
                <span class="w-5 shrink-0 text-xs opacity-70">{{ index + 1 }}</span>
                <span class="min-w-0 flex-1 truncate">{{ member.name }}</span>
                <CircleCheck v-if="done(member)" class="size-4 shrink-0" aria-label="оценён" />
              </button>
            </li>
          </ul>
        </nav>

        <div id="co-sheet" class="flex scroll-mt-4 flex-col gap-4">
          <section v-for="member in sheet.members" v-show="selected?.applicationId === member.applicationId" :key="member.applicationId" class="flex flex-col gap-4">
            <div class="flex items-center justify-between gap-3">
              <h2 class="font-display text-2xl">{{ member.name }}</h2>
              <NuxtLink
                :to="`/staff/applications/${member.applicationId}`"
                class="text-accent shrink-0 text-sm font-medium hover:underline"
              >
                Анкета
              </NuxtLink>
            </div>

            <StaffReviewPanel
              v-for="review in member.reviews.filter((item) => item.isMine)"
              :key="review.id"
              :card="card"
              :review="review"
              :can-edit="Boolean(data?.isExpert)"
              @changed="changed"
            />
            <p v-if="data?.isExpert && !mine(member)" class="bg-card border-line text-ink-soft rounded-3xl border p-5 text-sm">
              Вашей оценки у этого кандидата нет — обновите страницу или попросите распределяющего проверить группу.
            </p>

            <details v-if="member.reviews.some((item) => !item.isMine)" class="group flex flex-col gap-3" :open="!data?.isExpert">
              <summary class="flex min-h-10 cursor-pointer items-center gap-1.5 text-sm font-medium">
                Оценки других экспертов: {{ member.reviews.filter((item) => !item.isMine).length }}
                <ChevronDown class="text-ink-soft size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
              </summary>
              <div class="mt-3 flex flex-col gap-4">
                <StaffReviewPanel
                  v-for="review in member.reviews.filter((item) => !item.isMine)"
                  :key="review.id"
                  :card="card"
                  :review="review"
                  :can-edit="false"
                />
              </div>
            </details>
          </section>
        </div>
      </div>
    </template>
  </main>
</template>
