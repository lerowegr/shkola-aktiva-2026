<script setup lang="ts">
import { ArrowLeft, BellRing, CalendarClock, ChevronDown, ChevronRight, MailPlus, MapPin, Pencil, Plus, Trash2, TriangleAlert } from "lucide-vue-next";

import type { ActionResult } from "~/composables/useAction";
import type { HomeworkLink } from "~~/lib/applications/homework";
import { placeLine } from "~~/lib/assessment/rules";

/**
 * Страница сбора ЦО: кто что ответил на приглашение, подгруппы — блоками с
 * заголовками (отбивка), над ними — нераспределённые: пришедшие сверху.
 * Подгруппы видят только организаторы и эксперты; кандидату — только сбор.
 */
definePageMeta({ layout: "staff" });

type Answer = "GOING" | "RESERVE" | "CANT" | null;
interface Person {
  applicationId: string;
  name: string;
  faculty: string | null;
  answer: Answer;
  attended: boolean;
  groupId: string | null;
  homeworkLinks: HomeworkLink[];
}
interface Group {
  id: string;
  title: string;
  faculty: string | null;
  experts: { id: string; name: string }[];
  members: number;
  done: number;
  people: Person[];
}
interface Page {
  session: {
    id: string;
    title: string;
    building: string | null;
    room: string | null;
    startsAt: string;
    note: string | null;
    faculties: string[];
    reserve: boolean;
    capacity: number;
    occupied: number;
    invitedAt: string | null;
    stale: boolean;
    counts: { invited: number; going: number; reserve: number; cant: number; silent: number };
  };
  answers: Record<"going" | "reserve" | "cant" | "silent", Person[]>;
  groups: Group[];
  unassigned: Person[];
  noFaculty: { applicationId: string; name: string }[];
}

const route = useRoute();
const { data, refresh, error } = await useFetch<{
  manage: boolean;
  page: Page;
  experts: { id: string; name: string }[];
  targets: { id: string; title: string; startsAt: string; reserve: boolean }[];
}>(
  () => `/api/staff/assessment/session/${route.params.id}`,
);
useHead({ title: () => data.value?.page.session.title ?? "Сбор ЦО" });

const page = computed(() => data.value?.page ?? null);
const manage = computed(() => Boolean(data.value?.manage));

const notice = ref<ActionResult | null>(null);
const busy = ref<string | null>(null);
const editing = ref<string | "new" | null>(null);
const confirmDelete = ref<string | null>(null);

async function act(key: string, url: string, body: Record<string, unknown>, quiet = false) {
  busy.value = key;
  try {
    const result = await $fetch<ActionResult>(url, { method: "POST", body, ignoreResponseError: true }).catch(
      (): ActionResult => ({ ok: false, message: "Нет связи с сайтом. Проверьте интернет." }),
    );
    if (!quiet || !result.ok) notice.value = result;
    if (result.ok) {
      await refresh();
      void refreshNuxtData("staff-nav");
    }
  } finally {
    busy.value = null;
  }
}

function move(person: Person, value: string) {
  void act(`m:${person.applicationId}`, "/api/staff/assessment/member", { applicationId: person.applicationId, groupId: value || null });
}
function attend(person: Person) {
  void act(`a:${person.applicationId}`, "/api/staff/assessment/attend", { applicationId: person.applicationId, attended: !person.attended }, true);
}

async function saved() {
  editing.value = null;
  notice.value = { ok: true, message: "Подгруппа сохранена." };
  await refresh();
}

const picked = ref<string[]>([]);

// Ручной перенос на другое время, в очередь резерва или «не придёт».
async function moved(result: ActionResult) {
  notice.value = result;
  if (result.ok) {
    await refresh();
    void refreshNuxtData("staff-nav");
  }
}

// Сообщение всем, кто идёт на сбор: перенос, аудитория, что взять.
const messageText = ref("");
const confirmMessage = ref(false);
async function sendMessage() {
  confirmMessage.value = false;
  await act("message", "/api/staff/assessment/message", { sessionId: page.value?.session.id, text: messageText.value });
  if (notice.value?.ok) messageText.value = "";
}
function inviteNoFaculty() {
  void act("nf", "/api/staff/assessment/invite", { sessionId: page.value?.session.id, applicationIds: picked.value }).then(() => {
    picked.value = [];
  });
}

const ANSWER: Record<"GOING" | "RESERVE" | "CANT", string> = { GOING: "будет", RESERVE: "резервный день", CANT: "не сможет" };
const answerLine = (person: Person) => [person.faculty, person.answer ? ANSWER[person.answer] : "не ответил(а)"].filter(Boolean).join(" · ");
const suggestedTitle = computed(() => `Подгруппа ${(page.value?.groups.length ?? 0) + 1}`);
const LISTS = [
  { key: "going", title: "Будут" },
  { key: "reserve", title: "Придут в резервный день" },
  { key: "cant", title: "Не смогут ни в один из дней" },
  { key: "silent", title: "Не ответили" },
] as const;
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <NuxtLink to="/staff/assessment" class="text-ink-soft hover:text-ink flex items-center gap-1 text-sm">
      <ArrowLeft class="size-4" aria-hidden="true" /> Центр оценки
    </NuxtLink>

    <p v-if="error" class="bg-card border-line rounded-3xl border p-5 text-sm">{{ error.statusMessage || "Сбор недоступен." }}</p>

    <template v-if="page">
      <div class="flex flex-col gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <h1 class="font-display text-3xl">{{ page.session.title }}</h1>
          <span v-if="page.session.reserve && !/резерв/i.test(page.session.title)" class="bg-brand-yellow-soft rounded-lg px-2 py-0.5 text-xs font-semibold">Резервный день</span>
        </div>
        <div class="text-ink-soft flex flex-col gap-1 text-sm sm:flex-row sm:flex-wrap sm:gap-4">
          <span v-if="page.session.building || page.session.room" class="flex items-center gap-1.5"><MapPin class="size-4" aria-hidden="true" />{{ placeLine(page.session) }}</span>
          <span class="flex items-center gap-1.5">
            <CalendarClock class="size-4" aria-hidden="true" />{{ mskDay(page.session.startsAt) }}, {{ mskTime(page.session.startsAt) }} МСК
          </span>
          <span>{{ page.session.reserve ? "Все факультеты" : page.session.faculties.join(", ") }}</span>
          <span :class="page.session.occupied >= page.session.capacity ? 'text-danger font-medium' : ''">
            Занято мест: {{ page.session.occupied }} / {{ page.session.capacity }}
          </span>
        </div>
        <p v-if="page.session.stale" class="text-danger flex items-start gap-1.5 text-sm">
          <TriangleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Место или время изменились после приглашения — сообщите об изменении на странице «Центр оценки».
        </p>
      </div>

      <UiNotice :ok="notice?.ok" :message="notice?.message" />

      <!-- Сообщение всем, кто придёт -->
      <section v-if="manage" class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
        <div class="flex flex-col gap-1">
          <h2 class="font-display text-xl">Написать всем, кто идёт на этот сбор</h2>
          <p class="text-ink-soft text-sm">
            Придёт сразу — на сайт и в Telegram, даже ночью. Получат все, кто ответил «буду» или ещё не ответил, кроме «не смогу»
            и очереди на резерв. Время и место в кабинете это не меняет — для этого «Изменить» сбор и «Сообщить об изменении».
          </p>
        </div>
        <textarea
          v-model="messageText"
          rows="3"
          maxlength="1000"
          placeholder="Например: сбор переносится на 19:00, аудитория 410"
          aria-label="Текст сообщения"
          class="border-line bg-paper focus:border-accent rounded-xl border px-3 py-2.5 text-base outline-none"
        />
        <div v-if="!confirmMessage">
          <UiButton :disabled="!messageText.trim() || busy !== null" :pending="busy === 'message'" @click="confirmMessage = true">
            <MailPlus class="size-4" aria-hidden="true" /> Отправить
          </UiButton>
        </div>
        <div v-else class="bg-brand-yellow-soft flex flex-col gap-2 rounded-2xl p-3 text-sm" role="alertdialog" aria-label="Отправить сообщение?">
          <p class="font-semibold">Отправить всем, кто идёт на «{{ page.session.title }}»?</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="bg-accent text-accent-ink rounded-xl px-4 py-2 font-semibold" @click="sendMessage">Да, отправить</button>
            <button type="button" class="text-ink-soft rounded-xl px-4 py-2" @click="confirmMessage = false">Отмена</button>
          </div>
        </div>
      </section>

      <!-- Ответы на приглашение -->
      <section class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 class="font-display text-xl">Ответы на приглашение: {{ page.session.counts.invited }}</h2>
          <div v-if="manage" class="flex flex-col gap-2 sm:flex-row">
            <UiButton
              v-if="!page.session.reserve"
              :pending="busy === 'invite'"
              @click="act('invite', '/api/staff/assessment/invite', { sessionId: page.session.id })"
            >
              <MailPlus class="size-4" aria-hidden="true" /> Пригласить
            </UiButton>
            <UiButton
              variant="ghost"
              :pending="busy === 'remind'"
              :disabled="page.session.counts.silent === 0"
              @click="act('remind', '/api/staff/assessment/remind', { sessionId: page.session.id })"
            >
              <BellRing class="size-4" aria-hidden="true" /> Напомнить неответившим
            </UiButton>
          </div>
        </div>
        <p v-if="page.session.reserve" class="text-ink-soft text-sm">
          Сюда приходят и ответившие «Приду в резервный день» с других сборов — они в подгруппах и в нераспределённых ниже.
        </p>
        <details v-for="list in LISTS" :key="list.key" class="group/list border-line border-t pt-2">
          <summary class="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium">
            {{ list.title }}: {{ page.answers[list.key].length }}
            <ChevronDown class="text-ink-soft size-4 transition-transform group-open/list:rotate-180" aria-hidden="true" />
          </summary>
          <ul class="flex flex-col gap-1 pb-2">
            <li v-for="person in page.answers[list.key]" :key="person.applicationId" class="flex flex-col gap-2 text-sm sm:flex-row sm:items-start sm:justify-between">
              <span>
                <NuxtLink :to="`/staff/applications/${person.applicationId}`" class="hover:underline">{{ person.name }}</NuxtLink>
                <span v-if="person.faculty" class="text-ink-soft text-xs"> · {{ person.faculty }}</span>
              </span>
              <div class="flex min-w-0 flex-col gap-2 sm:w-1/2 sm:shrink-0 sm:flex-row sm:items-start sm:justify-end">
                <StaffAssessmentHomeworkLinks :links="person.homeworkLinks" :name="person.name" />
                <StaffAssessmentMove
                  v-if="manage"
                  class="min-w-0 flex-1"
                  :application-id="person.applicationId"
                  :name="person.name"
                  :current-session-id="page.session.id"
                  :targets="data?.targets ?? []"
                  @done="moved"
                />
              </div>
            </li>
            <li v-if="page.answers[list.key].length === 0" class="text-ink-soft text-sm">Никого.</li>
          </ul>
        </details>
      </section>

      <!-- Нераспределённые -->
      <section class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
        <h2 class="font-display text-xl">Не в подгруппе: {{ page.unassigned.length }}</h2>
        <p class="text-ink-soft text-sm">
          Записавшиеся на это время. Кандидаты без выбора времени и очередь резерва сюда не попадают. Сверху — отмеченные «пришёл».
          Положили в подгруппу — отметка «пришёл» ставится сама.
        </p>
        <ul v-if="page.unassigned.length" class="divide-line flex flex-col divide-y">
          <li v-for="person in page.unassigned" :key="person.applicationId" class="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
            <span class="text-sm">
              {{ person.name }}
              <span class="text-ink-soft text-xs">· {{ answerLine(person) }}</span>
            </span>
            <div class="flex min-w-0 flex-wrap items-center gap-2">
              <StaffAssessmentHomeworkLinks :links="person.homeworkLinks" :name="person.name" />
              <template v-if="manage">
                <button
                  type="button"
                  class="min-h-9 rounded-xl border px-3 text-sm font-medium transition"
                  :class="person.attended ? 'border-ok bg-ok/10 text-ok' : 'border-line text-ink-soft'"
                  :aria-pressed="person.attended"
                  :disabled="busy === `a:${person.applicationId}`"
                  @click="attend(person)"
                >
                  {{ person.attended ? "Пришёл ✓" : "Пришёл?" }}
                </button>
                <UiSelect
                  v-if="page.groups.length"
                  size="sm"
                  model-value=""
                  :disabled="busy === `m:${person.applicationId}`"
                  :aria-label="`В подгруппу: ${person.name}`"
                  @change="move(person, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="" disabled>В подгруппу…</option>
                  <option v-for="option in page.groups.filter((group) => !group.faculty || group.faculty === person.faculty)" :key="option.id" :value="option.id">{{ option.title }}{{ option.faculty ? ` · ${option.faculty}` : '' }}</option>
                </UiSelect>
                <StaffAssessmentMove
                  :application-id="person.applicationId"
                  :name="person.name"
                  :current-session-id="page.session.id"
                  :targets="data?.targets ?? []"
                  @done="moved"
                />
              </template>
            </div>
          </li>
        </ul>
        <p v-else class="text-ink-soft text-sm">Все распределены.</p>
      </section>

      <!-- Подгруппы: отбивка -->
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 class="font-display text-2xl">Подгруппы: {{ page.groups.length }}</h2>
        <div v-if="manage" class="shrink-0">
          <UiButton @click="editing = 'new'"><Plus class="size-4" aria-hidden="true" /> Новая подгруппа</UiButton>
        </div>
      </div>

      <section v-if="editing === 'new' && manage" class="bg-card border-line rounded-3xl border p-5">
        <h3 class="font-display mb-4 text-xl">Новая подгруппа</h3>
        <StaffAssessmentGroupForm
          :group="null"
          :session-id="page.session.id"
          :faculties="page.session.faculties"
          :pool="data?.experts ?? []"
          :suggested-title="suggestedTitle"
          @saved="saved"
          @cancel="editing = null"
        />
      </section>

      <p v-if="page.groups.length === 0" class="bg-card border-line text-ink-soft rounded-3xl border p-5 text-sm">
        Подгрупп пока нет. Создайте их и разложите пришедших — кандидат подгрупп не видит.
      </p>

      <div class="grid gap-4 lg:grid-cols-2">
        <article v-for="group in page.groups" :key="group.id" class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
          <template v-if="editing === group.id && manage">
            <h3 class="font-display text-xl">{{ group.title }}</h3>
            <StaffAssessmentGroupForm
              :group="group"
              :session-id="page.session.id"
              :faculties="page.session.faculties"
              :pool="data?.experts ?? []"
              :suggested-title="group.title"
              @saved="saved"
              @cancel="editing = null"
            />
          </template>
          <template v-else>
            <header class="border-line flex items-start justify-between gap-3 border-b pb-3">
              <div class="min-w-0">
                <h3 class="font-display text-xl">{{ group.title }}</h3>
                <p class="text-ink-soft text-sm">{{ group.faculty ?? 'Общая подгруппа — создана ранее' }}</p>
                <p class="text-ink-soft text-sm">
                  {{ group.experts.map((expert) => expert.name).join(", ") || "Эксперты не назначены" }}
                </p>
              </div>
              <span class="bg-paper text-ink-soft shrink-0 rounded-xl px-2.5 py-1 text-xs">{{ group.people.length }} чел. · оценено {{ group.done }}</span>
            </header>

            <ol class="divide-line flex flex-col divide-y">
              <li v-for="(person, index) in group.people" :key="person.applicationId" class="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span class="text-sm">
                  <span class="text-ink-soft mr-1.5 text-xs">{{ index + 1 }}</span>{{ person.name }}
                  <span v-if="person.faculty" class="text-ink-soft text-xs"> · {{ person.faculty }}</span>
                </span>
                <div class="flex min-w-0 flex-wrap items-center gap-2">
                  <StaffAssessmentHomeworkLinks :links="person.homeworkLinks" :name="person.name" />
                  <UiSelect
                    v-if="manage"
                    size="sm"
                    :model-value="group.id"
                    :disabled="busy === `m:${person.applicationId}`"
                    :aria-label="`Подгруппа: ${person.name}`"
                    @change="move(person, ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="option in page.groups.filter((group) => !group.faculty || group.faculty === person.faculty)" :key="option.id" :value="option.id">{{ option.title }}{{ option.faculty ? ` · ${option.faculty}` : '' }}</option>
                    <option value="">Убрать из подгруппы</option>
                  </UiSelect>
                </div>
              </li>
              <li v-if="manage && group.people.length" class="pt-2">
                <details class="text-sm">
                  <summary class="text-ink-soft cursor-pointer">Перенести кого-то из подгруппы на другое время…</summary>
                  <ul class="mt-2 flex flex-col gap-2">
                    <li v-for="person in group.people" :key="person.applicationId" class="flex flex-col gap-1">
                      <span>{{ person.name }}</span>
                      <StaffAssessmentMove
                        :application-id="person.applicationId"
                        :name="person.name"
                        :current-session-id="page.session.id"
                        :targets="data?.targets ?? []"
                        @done="moved"
                      />
                    </li>
                  </ul>
                </details>
              </li>
              <li v-if="group.people.length === 0" class="text-ink-soft py-2 text-sm">Пока никого.</li>
            </ol>

            <div class="mt-auto grid gap-2 sm:grid-cols-2">
              <UiButton class="sm:col-span-2" :href="`/staff/assessment/${group.id}`">
                Экран подгруппы <ChevronRight class="size-4" aria-hidden="true" />
              </UiButton>
              <template v-if="manage">
                <UiButton variant="ghost" @click="editing = group.id"><Pencil class="size-4" aria-hidden="true" /> Изменить</UiButton>
                <UiButton v-if="confirmDelete !== group.id" variant="ghost" :pending="busy === `d:${group.id}`" @click="confirmDelete = group.id">
                  <Trash2 class="size-4" aria-hidden="true" /> Удалить
                </UiButton>
                <div v-else class="bg-brand-red-soft flex flex-col gap-2 rounded-2xl p-3 text-sm sm:col-span-2" role="alertdialog" :aria-label="`Удалить ${group.title}?`">
                  <p class="font-semibold">Удалить «{{ group.title }}»?</p>
                  <p>{{ group.people.length ? `Кандидаты (${group.people.length}) станут нераспределёнными. Начатые оценки сохранятся.` : "В подгруппе никого нет." }}</p>
                  <div class="flex flex-wrap gap-2">
                    <button
                      type="button"
                      class="bg-danger rounded-xl px-4 py-2 font-semibold text-white"
                      @click="(confirmDelete = null), act(`d:${group.id}`, '/api/staff/assessment/group-delete', { id: group.id })"
                    >
                      Да, удалить
                    </button>
                    <button type="button" class="text-ink-soft rounded-xl px-4 py-2" @click="confirmDelete = null">Отмена</button>
                  </div>
                </div>
              </template>
            </div>
          </template>
        </article>
      </div>

      <!-- Без факультета -->
      <section v-if="manage && page.noFaculty.length" class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
        <h2 class="font-display text-xl">Без факультета: {{ page.noFaculty.length }}</h2>
        <p class="text-ink-soft text-sm">
          Отправили анкету, но факультет не указали — в приглашение по факультетам не попадают. Отметьте, кого пригласить на этот сбор.
        </p>
        <div class="grid gap-2 sm:grid-cols-2">
          <UiCheckbox v-for="person in page.noFaculty" :key="person.applicationId" v-model="picked" :value="person.applicationId">{{ person.name }}</UiCheckbox>
        </div>
        <UiButton class="self-start" :disabled="picked.length === 0" :pending="busy === 'nf'" @click="inviteNoFaculty">
          <MailPlus class="size-4" aria-hidden="true" /> Пригласить отмеченных: {{ picked.length }}
        </UiButton>
      </section>
    </template>
  </main>
</template>
