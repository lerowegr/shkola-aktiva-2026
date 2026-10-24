<script setup lang="ts">
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, FileText, MapPin, Send } from "lucide-vue-next";

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
// ДЗ и собеседование — одной колонкой: сначала работа и сценарий, критерии внизу.
const stacked = computed(() => stage.value !== "APPLICATION");

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
  const mine = reviews.findIndex((item) => item.isMine && !item.released);
  return reviews[mine >= 0 && shownReview.value === 0 ? mine : shownReview.value] ?? null;
});

const back = computed(() => {
  if (stage.value === "HOMEWORK") return { to: "/staff/homework", label: "Оценка ДЗ" };
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

// --- Биржа: взять, передать, вернуть -------------------------------------------
const session = await useSession();
const canReview = computed(() => session.value?.permissions.includes("applications.review") ?? false);
// «Написать»: ветка переписки с кандидатом — от лица ША (бот в Telegram и сайт).
const canMessage = computed(() => session.value?.isOwner || (session.value?.permissions.includes("messages.reply") ?? false));
const openThread = useAction("/api/staff/messages/open");
async function writeTo() {
  const result = await openThread.submit({ applicationId: id.value });
  if (result.ok && typeof result.threadId === "string") await navigateTo(`/staff/messages?thread=${result.threadId}`);
}
const myActive = computed(() => card.value?.reviews.find((item) => item.isMine && !item.released) ?? null);
const holders = computed(() => (card.value?.reviews ?? []).filter((item) => !item.released && !item.isMine));

const { data: mates } = await useFetch("/api/staff/colleagues", {
  immediate: canReview.value,
  key: "staff-colleagues",
});
const take = useAction("/api/staff/reviews/take");
const transfer = useAction("/api/staff/reviews/transfer");
const release = useAction("/api/staff/reviews/release");
const passTo = ref("");
const confirmDrop = ref(false);

async function done(ok: unknown) {
  if (ok) {
    passTo.value = "";
    confirmDrop.value = false;
    await refresh();
    await refreshNuxtData("staff-nav");
  }
}

async function takeIt() {
  const result = await take.submit({ applicationId: id.value, stage: stage.value });
  await done(result.ok);
}

async function passIt() {
  if (!myActive.value || !passTo.value) return;
  const result = await transfer.submit({ reviewId: myActive.value.id, toUserId: passTo.value });
  await done(result.ok);
}

async function releaseIt(keep: boolean) {
  if (!myActive.value) return;
  const result = await release.submit({ reviewId: myActive.value.id, keep });
  await done(result.ok);
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
      <div class="flex flex-wrap gap-2">
        <UiButton
          v-if="canMessage"
          variant="telegram"
          class="min-h-10 px-3 text-sm sm:w-auto"
          :pending="openThread.pending.value"
          :title="card.hasTelegram ? 'Сообщение придёт ему от бота ША в Telegram и на сайт' : 'Telegram не привязан — увидит только на сайте'"
          @click="writeTo"
        >
          <Send class="size-4" aria-hidden="true" /> Написать{{ card.hasTelegram ? " в Telegram" : "" }}
        </UiButton>
        <UiButton variant="ghost" class="min-h-10 px-3 text-sm sm:w-auto" :disabled="!data?.prev" @click="go(data?.prev ?? null)">
          <ChevronLeft class="size-4" aria-hidden="true" /> Предыдущая
        </UiButton>
        <UiButton variant="ghost" class="min-h-10 px-3 text-sm sm:w-auto" :disabled="!data?.next" @click="go(data?.next ?? null)">
          Следующая <ChevronRight class="size-4" aria-hidden="true" />
        </UiButton>
      </div>
    </div>

    <UiNotice v-if="openThread.result.value?.ok === false" :message="openThread.result.value.message" />

    <!-- Анкета — две колонки: ответы и оценка рядом. ДЗ и собеседование — одной
         колонкой: работа, сценарий собеса, а критерии в самом низу. -->
    <div class="items-start gap-5" :class="stacked ? 'flex flex-col' : 'grid lg:grid-cols-[minmax(0,1fr)_400px]'">
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

          <!-- Формулировки заданий ДЗ — как их видел кандидат. На ДЗ раскрыты, на собеседовании — по клику. -->
          <details
            v-if="card.homeworkTasks.length"
            class="bg-card border-line group/tasks rounded-3xl border p-5"
            :open="card.stage === 'HOMEWORK'"
          >
            <summary class="flex cursor-pointer items-center justify-between gap-3 font-semibold select-none">
              Задания домашнего задания
              <ChevronDown class="text-ink-soft size-5 transition-transform group-open/tasks:rotate-180" aria-hidden="true" />
            </summary>
            <div class="mt-4 flex flex-col gap-4">
              <div v-for="task in card.homeworkTasks" :key="task.label" class="flex flex-col gap-2">
                <p v-if="card.homeworkTasks.length > 1" class="text-ink-soft text-xs font-semibold">{{ task.label }}</p>
                <FormRichHelp :text="task.help" />
              </div>
            </div>
          </details>

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
            <p v-if="currentWork.text" class="text-sm break-words whitespace-pre-line">
              <template v-for="(part, i) in linkParts(currentWork.text)" :key="i">
                <a v-if="part.href" :href="part.href" target="_blank" rel="noopener noreferrer" class="text-accent underline-offset-2 hover:underline">{{ part.text }}</a>
                <template v-else>{{ part.text }}</template>
              </template>
            </p>

            <details v-if="olderWork.length" class="group text-sm">
              <summary class="text-ink-soft flex cursor-pointer items-center gap-1.5">Прежние версии: {{ olderWork.length }}<ChevronDown class="size-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
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
            <summary class="text-ink-soft hover:text-ink flex cursor-pointer items-center gap-1.5 px-1 text-sm font-medium">Анкета кандидата<ChevronDown class="size-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
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

      <StaffGuide
        v-if="stage === 'INTERVIEW' && data?.guide && data.guide.blocks.length > 0"
        :key="id"
        :guide="data.guide"
        :application-id="id"
        :can-write="canReview && (data?.canEdit ?? false)"
        :my-id="session?.id ?? null"
      />

      <!-- Оценка -->
      <div class="flex w-full flex-col gap-3" :class="!stacked && 'lg:sticky lg:top-4'">        <div v-if="card.reviews.length > 1" class="bg-card border-line flex gap-1 overflow-x-auto rounded-2xl border p-1">
          <button
            v-for="(item, index) in card.reviews"
            :key="item.id"
            type="button"
            class="min-h-9 shrink-0 rounded-xl px-3 text-sm"
            :class="review?.id === item.id ? 'bg-paper font-semibold' : 'text-ink-soft'"
            @click="shownReview = index"
          >
            {{ item.isMine ? "Моя оценка" : item.reviewer.name }}{{ item.released ? " (возвращена)" : "" }}
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

        <div v-if="canReview" class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-4">
          <p class="text-sm font-semibold">Проверка</p>
          <p v-if="holders.length > 0" class="text-ink-soft text-sm">
            На проверке у: {{ holders.map((item) => item.reviewer.name).join(", ") }}
          </p>
          <template v-if="myActive">
            <div class="flex gap-2">
              <UiSelect v-model="passTo" size="md" aria-label="Передать мастеру">
                <option value="" disabled>Мастер…</option>
                <option
                  v-for="person in mates?.colleagues ?? []"
                  :key="person.id"
                  :value="person.id"
                  :disabled="card.reviews.some((item) => item.reviewer.id === person.id && !item.released)"
                >
                  {{ person.name }} — {{ person.load }}
                </option>
              </UiSelect>
              <div class="shrink-0 self-end">
                <UiButton :pending="transfer.pending.value" :disabled="!passTo" @click="passIt">Передать</UiButton>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <UiButton variant="ghost" :pending="release.pending.value" @click="releaseIt(true)">Вернуть с сохранением</UiButton>
              <UiButton
                v-if="!confirmDrop"
                variant="ghost"
                @click="confirmDrop = true"
              >
                Вернуть без сохранения
              </UiButton>
              <UiButton
                v-else
                variant="ghost"
                :pending="release.pending.value"
                @click="releaseIt(false)"
              >
                Точно удалить баллы?
              </UiButton>
            </div>
          </template>
          <UiButton v-else :pending="take.pending.value" @click="takeIt">Взять на проверку</UiButton>
          <UiNotice :message="take.result.value?.ok === false ? take.result.value.message : transfer.result.value?.ok === false ? transfer.result.value.message : release.result.value?.ok === false ? release.result.value.message : null" />
        </div>

        <form
          v-if="data?.canAssign"
          class="bg-card border-line flex flex-col gap-2 rounded-3xl border p-4"
          @submit.prevent="pass"
        >
          <label for="reassign" class="text-sm font-semibold">Передать другому мастеру</label>
          <div class="flex gap-2">
            <UiSelect
              id="reassign"
              v-model="target"
              size="md"
              aria-label="Передать другому мастеру"
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
            </UiSelect>
            <div class="shrink-0 self-end">
              <UiButton type="submit" :pending="reassign.pending.value" :disabled="!target">
                Передать
              </UiButton>
            </div>
          </div>
          <UiNotice :ok="reassign.result.value?.ok" :message="reassign.result.value?.message" />
        </form>
      </div>
    </div>

  </main>
</template>
