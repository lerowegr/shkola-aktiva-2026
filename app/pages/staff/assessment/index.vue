<script setup lang="ts">
import { BellRing, CalendarClock, ChevronRight, MailPlus, MapPin, Pencil, Plus, Trash2, TriangleAlert, UsersRound } from "lucide-vue-next";

import type { ActionResult } from "~/composables/useAction";
import { placeLine } from "~~/lib/assessment/rules";

/**
 * «Центр оценки»: очный групповой этап. Организатор заводит сборы (где и
 * когда собираются все, каких факультетов зовём) и приглашает кандидатов —
 * они отвечают «буду», «в резервный день» или «не смогу». Подгруппы с
 * экспертами — внутри сбора, на его странице; кандидат их не видит.
 * Эксперт видит здесь свои подгруппы и уходит оценивать на их экран.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Центр оценки" });

interface SessionRow {
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
  groups: { id: string; title: string; experts: { id: string; name: string }[]; members: number; done: number }[];
}
interface Overview {
  manage: boolean;
  viewAll: boolean;
  me: string;
  criteria: number;
  sessions: SessionRow[];
  notInvited: number;
  noFaculty: number;
  hasReserve: boolean;
}

const { data, refresh } = await useFetch<Overview>("/api/staff/assessment");

const editing = ref<string | "new" | null>(null);
const notice = ref<ActionResult | null>(null);
const busy = ref<string | null>(null);
const confirmDelete = ref<string | null>(null);

async function act(key: string, url: string, body: Record<string, unknown>) {
  busy.value = key;
  try {
    notice.value = await $fetch<ActionResult>(url, { method: "POST", body, ignoreResponseError: true }).catch(() => ({
      ok: false,
      message: "Нет связи с сайтом. Проверьте интернет.",
    }));
    if (notice.value.ok) {
      await refresh();
      void refreshNuxtData("staff-nav");
    }
  } finally {
    busy.value = null;
  }
}

async function saved() {
  const created = editing.value === "new";
  editing.value = null;
  notice.value = { ok: true, message: created ? "Сбор создан. Теперь пригласите кандидатов." : "Сбор сохранён." };
  await refresh();
}

async function removeSession(session: SessionRow) {
  confirmDelete.value = null;
  await act(`d:${session.id}`, "/api/staff/assessment/session-delete", { id: session.id });
}

const when = (value: string) => `${mskDay(value)}, ${mskTime(value)} МСК`;
const canOpen = (group: SessionRow["groups"][number]) => data.value?.viewAll || group.experts.some((expert) => expert.id === data.value?.me);
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <div class="flex flex-col gap-1">
      <h1 class="font-display text-3xl">Центр оценки</h1>
      <p class="text-ink-soft max-w-2xl text-sm">
        Очный групповой этап. Кандидатов приглашают на сбор — место и время, где собираются все. Внутри сбора организатор
        делит пришедших на подгруппы с экспертами. Кандидат видит только сбор; подгрупп, оценок и комментариев — никогда.
      </p>
    </div>

    <div v-if="data?.criteria === 0" class="bg-brand-yellow-soft rounded-2xl p-4 text-sm">
      У этапа нет критериев — добавьте их в «Админка → Анкета и оценка → Оценка ЦО».
    </div>

    <template v-if="data?.manage">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-ink-soft text-sm">
          Сборов: {{ data.sessions.length }} · ещё не приглашены: {{ data.notInvited }}<template v-if="data.noFaculty">
            (из них без факультета: {{ data.noFaculty }} — пригласите на странице сбора)</template>
        </p>
        <div class="shrink-0">
          <UiButton @click="editing = 'new'"><Plus class="size-4" aria-hidden="true" /> Новый сбор</UiButton>
        </div>
      </div>
      <p v-if="!data.hasReserve && data.sessions.length" class="bg-brand-yellow-soft rounded-2xl p-3 text-sm">
        Резервного дня нет — ответ «Приду в резервный день» кандидатам недоступен. Создайте сбор с галочкой «резервный день».
      </p>

      <UiNotice :ok="notice?.ok" :message="notice?.message" />

      <section v-if="editing === 'new'" class="bg-card border-line rounded-3xl border p-5">
        <h2 class="font-display mb-4 text-xl">Новый сбор</h2>
        <StaffAssessmentSessionForm :session="null" :has-reserve="data.hasReserve" @saved="saved" @cancel="editing = null" />
      </section>
    </template>

    <p v-if="data && data.sessions.length === 0" class="bg-card border-line text-ink-soft rounded-3xl border p-5 text-sm">
      {{
        data.manage
          ? "Сборов пока нет. Создайте первый — корпус, общая аудитория, время и факультеты, — потом пригласите кандидатов."
          : "Вас пока не назначили экспертом ни в одну подгруппу."
      }}
    </p>

    <div class="grid gap-4 lg:grid-cols-2">
      <article v-for="session in data?.sessions ?? []" :key="session.id" class="bg-card border-line flex flex-col gap-4 rounded-3xl border p-5">
        <template v-if="editing === session.id && data?.manage">
          <h2 class="font-display text-xl">{{ session.title }}</h2>
          <StaffAssessmentSessionForm :session="session" :has-reserve="data.hasReserve" @saved="saved" @cancel="editing = null" />
        </template>

        <template v-else>
          <div class="flex flex-col gap-1.5">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="font-display text-xl">{{ session.title }}</h2>
              <span v-if="session.reserve && !/резерв/i.test(session.title)" class="bg-brand-yellow-soft rounded-lg px-2 py-0.5 text-xs font-semibold">Резервный день</span>
            </div>
            <p class="flex items-center gap-1.5 text-sm" :class="session.building || session.room ? '' : 'text-ink-soft'">
              <MapPin class="size-4 shrink-0" aria-hidden="true" />
              {{ session.building || session.room ? placeLine(session) : "Место не указано" }}
            </p>
            <p class="flex items-center gap-1.5 text-sm">
              <CalendarClock class="size-4 shrink-0" aria-hidden="true" /> {{ when(session.startsAt) }}
            </p>
            <p class="text-ink-soft text-sm">{{ session.reserve ? "Все факультеты" : session.faculties.join(", ") }}</p>
            <p class="text-sm font-medium" :class="session.occupied >= session.capacity ? 'text-danger' : 'text-ink-soft'">
              Занято мест: {{ session.occupied }} / {{ session.capacity }}<span v-if="session.occupied >= session.capacity"> — слот заполнен</span>
            </p>
          </div>

          <dl v-if="data?.manage || data?.viewAll" class="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            <div class="bg-paper rounded-2xl px-3 py-2">
              <dt class="text-ink-soft text-xs">Будут</dt>
              <dd class="font-display text-xl">{{ session.counts.going }}</dd>
            </div>
            <div class="bg-paper rounded-2xl px-3 py-2">
              <dt class="text-ink-soft text-xs">{{ session.reserve ? "Отказались" : "В резервный" }}</dt>
              <dd class="font-display text-xl">{{ session.reserve ? session.counts.cant : session.counts.reserve }}</dd>
            </div>
            <div v-if="!session.reserve" class="bg-paper rounded-2xl px-3 py-2">
              <dt class="text-ink-soft text-xs">Не смогут</dt>
              <dd class="font-display text-xl">{{ session.counts.cant }}</dd>
            </div>
            <div class="bg-paper rounded-2xl px-3 py-2">
              <dt class="text-ink-soft text-xs">Не ответили</dt>
              <dd class="font-display text-xl">{{ session.counts.silent }}</dd>
            </div>
          </dl>

          <p v-if="session.stale" class="text-danger flex items-start gap-1.5 text-sm">
            <TriangleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Место или время изменились после приглашения — кандидаты видят прежние. Сообщите об изменении.
          </p>
          <p v-else-if="session.invitedAt" class="text-ok text-sm">
            Приглашено: {{ session.counts.invited }}, последнее приглашение {{ mskFormat(session.invitedAt, "d MMMM, HH:mm") }}
          </p>
          <p v-else-if="data?.manage && !session.reserve" class="text-ink-soft text-sm">Кандидатов ещё не приглашали.</p>

          <div v-if="session.groups.length" class="flex flex-col gap-2">
            <p class="text-ink-soft flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase">
              <UsersRound class="size-3.5" aria-hidden="true" /> Подгруппы
            </p>
            <ul class="flex flex-col gap-1.5">
              <li v-for="group in session.groups" :key="group.id" class="bg-paper flex items-center justify-between gap-3 rounded-2xl px-3 py-2">
                <div class="min-w-0 text-sm">
                  <p class="font-semibold">{{ group.title }}</p>
                  <p class="text-ink-soft text-xs">
                    {{ group.experts.map((expert) => expert.name).join(", ") || "эксперты не назначены" }} · оценено {{ group.done }} из {{ group.members }}
                  </p>
                </div>
                <NuxtLink
                  v-if="canOpen(group)"
                  :to="`/staff/assessment/${group.id}`"
                  class="text-accent flex shrink-0 items-center gap-1 text-sm font-semibold"
                >
                  Оценивать <ChevronRight class="size-4" aria-hidden="true" />
                </NuxtLink>
              </li>
            </ul>
          </div>

          <div v-if="data?.manage || data?.viewAll" class="mt-auto grid gap-2 sm:grid-cols-2">
            <UiButton class="sm:col-span-2" :href="`/staff/assessment/session/${session.id}`">
              Ответы и подгруппы <ChevronRight class="size-4" aria-hidden="true" />
            </UiButton>
            <template v-if="data?.manage">
              <UiButton
                v-if="!session.reserve"
                :pending="busy === `i:${session.id}`"
                @click="act(`i:${session.id}`, '/api/staff/assessment/invite', { sessionId: session.id })"
              >
                <MailPlus class="size-4" aria-hidden="true" /> Пригласить на центр оценки
              </UiButton>
              <UiButton
                variant="ghost"
                :pending="busy === `r:${session.id}`"
                :disabled="session.counts.silent === 0"
                @click="act(`r:${session.id}`, '/api/staff/assessment/remind', { sessionId: session.id })"
              >
                <BellRing class="size-4" aria-hidden="true" /> Напомнить неответившим
              </UiButton>
              <UiButton
                v-if="session.stale"
                variant="ghost"
                :pending="busy === `c:${session.id}`"
                @click="act(`c:${session.id}`, '/api/staff/assessment/notify-change', { sessionId: session.id })"
              >
                <BellRing class="size-4" aria-hidden="true" /> Сообщить об изменении
              </UiButton>
              <UiButton variant="ghost" @click="editing = session.id"><Pencil class="size-4" aria-hidden="true" /> Изменить</UiButton>
              <UiButton v-if="confirmDelete !== session.id" variant="ghost" :pending="busy === `d:${session.id}`" @click="confirmDelete = session.id">
                <Trash2 class="size-4" aria-hidden="true" /> Удалить
              </UiButton>
              <div v-else class="bg-brand-red-soft flex flex-col gap-2 rounded-2xl p-3 text-sm sm:col-span-2" role="alertdialog" :aria-label="`Удалить ${session.title}?`">
                <p class="font-semibold">Удалить «{{ session.title }}»?</p>
                <p>
                  Уйдут подгруппы и приглашения<template v-if="session.counts.invited"> ({{ session.counts.invited }})</template>. Начатые
                  оценки экспертов сохранятся, пустые уберутся. Кандидатам ничего не придёт.
                </p>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="bg-danger rounded-xl px-4 py-2 font-semibold text-white" @click="removeSession(session)">Да, удалить</button>
                  <button type="button" class="text-ink-soft rounded-xl px-4 py-2" @click="confirmDelete = null">Отмена</button>
                </div>
              </div>
            </template>
          </div>
        </template>
      </article>
    </div>
  </main>
</template>
