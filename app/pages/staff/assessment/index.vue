<script setup lang="ts">
import { BellRing, CalendarClock, ChevronDown, ChevronRight, MapPin, Pencil, Plus, Shuffle, Trash2, TriangleAlert, UsersRound } from "lucide-vue-next";

import type { ActionResult } from "~/composables/useAction";
import { placeLine } from "~~/lib/assessment/rules";

/**
 * «Центр оценки»: очный групповой этап. Распределяющий собирает группы
 * (где, когда, кто оценивает, кто приходит) и сообщает кандидатам место.
 * Эксперт видит свои группы и уходит оценивать на экран группы.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Центр оценки" });

interface Group {
  id: string;
  title: string;
  building: string | null;
  room: string | null;
  startsAt: string | null;
  note: string | null;
  notifiedAt: string | null;
  stale: boolean;
  experts: { id: string; name: string }[];
  members: { applicationId: string; name: string; done: number; total: number }[];
}
interface Overview {
  manage: boolean;
  me: string;
  stage: { title: string; state: "upcoming" | "open" | "closed"; opensAt: string | null; closesAt: string | null } | null;
  criteria: number;
  groups: Group[];
  free: { applicationId: string; name: string }[];
  experts: { id: string; name: string }[];
}

const { data, refresh } = await useFetch<Overview>("/api/staff/assessment");

const editing = ref<string | "new" | null>(null);
const notice = ref<ActionResult | null>(null);
const busy = ref<string | null>(null);

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
  editing.value = null;
  notice.value = { ok: true, message: "Группа сохранена." };
  await refresh();
}

function move(applicationId: string, value: string) {
  void act(`m:${applicationId}`, "/api/staff/assessment/member", { applicationId, groupId: value || null });
}

const placed = computed(() => (data.value?.groups ?? []).reduce((sum, group) => sum + group.members.length, 0));
const suggestedTitle = computed(() => `Группа ${(data.value?.groups.length ?? 0) + 1}`);

function progress(group: Group) {
  const done = group.members.filter((member) => member.total > 0 && member.done === member.total).length;
  return `${done} из ${group.members.length}`;
}
const canOpen = (group: Group) => data.value?.manage || group.experts.some((expert) => expert.id === data.value?.me);
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <div class="flex flex-col gap-1">
      <h1 class="font-display text-3xl">Центр оценки</h1>
      <p class="text-ink-soft max-w-2xl text-sm">
        Очный групповой этап. Кандидаты приходят группами, эксперты группы оценивают каждого по критериям ЦО. Кандидат
        видит только описание этапа и место с временем — после того как группе сообщили. Оценок и результатов он не видит.
      </p>
    </div>

    <div v-if="data?.criteria === 0" class="bg-brand-yellow-soft rounded-2xl p-4 text-sm">
      У этапа нет критериев — добавьте их в «Админка → Анкета и оценка → Оценка ЦО».
    </div>

    <!-- Распределяющий -->
    <template v-if="data?.manage">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-ink-soft text-sm">
          Групп: {{ data.groups.length }} · в группах: {{ placed }} · без группы: {{ data.free.length }}
        </p>
        <div class="flex flex-col gap-2 sm:flex-row">
          <UiButton
            variant="ghost"
            :pending="busy === 'distribute'"
            :disabled="data.free.length === 0 || data.groups.length === 0"
            @click="act('distribute', '/api/staff/assessment/distribute', {})"
          >
            <Shuffle class="size-4" aria-hidden="true" /> Разложить поровну
          </UiButton>
          <UiButton @click="editing = 'new'"><Plus class="size-4" aria-hidden="true" /> Новая группа</UiButton>
        </div>
      </div>

      <UiNotice :ok="notice?.ok" :message="notice?.message" />

      <section v-if="editing === 'new'" class="bg-card border-line rounded-3xl border p-5">
        <h2 class="font-display mb-4 text-xl">Новая группа</h2>
        <StaffAssessmentGroupForm :group="null" :pool="data.experts" :suggested-title="suggestedTitle" @saved="saved" @cancel="editing = null" />
      </section>
    </template>

    <p v-if="data && data.groups.length === 0" class="bg-card border-line text-ink-soft rounded-3xl border p-5 text-sm">
      {{ data.manage ? "Групп пока нет. Создайте первую — с корпусом, аудиторией, временем и экспертами." : "Вас пока не назначили экспертом ни в одну группу." }}
    </p>

    <div class="grid gap-4 lg:grid-cols-2">
      <article v-for="group in data?.groups ?? []" :key="group.id" class="bg-card border-line flex flex-col gap-4 rounded-3xl border p-5">
        <template v-if="editing === group.id && data?.manage">
          <h2 class="font-display text-xl">{{ group.title }}</h2>
          <StaffAssessmentGroupForm :group="group" :pool="data.experts" :suggested-title="group.title" @saved="saved" @cancel="editing = null" />
        </template>

        <template v-else>
          <div class="flex items-start justify-between gap-3">
            <div class="flex min-w-0 flex-col gap-1.5">
              <h2 class="font-display text-xl">{{ group.title }}</h2>
              <p class="flex items-center gap-1.5 text-sm" :class="group.building || group.room ? '' : 'text-ink-soft'">
                <MapPin class="size-4 shrink-0" aria-hidden="true" />
                {{ group.building || group.room ? placeLine(group) : "Место не указано" }}
              </p>
              <p class="flex items-center gap-1.5 text-sm" :class="group.startsAt ? '' : 'text-ink-soft'">
                <CalendarClock class="size-4 shrink-0" aria-hidden="true" />
                {{ group.startsAt ? `${mskDay(group.startsAt)}, ${mskTime(group.startsAt)} МСК` : "Время не указано" }}
              </p>
            </div>
            <span class="bg-paper text-ink-soft shrink-0 rounded-xl px-2.5 py-1 text-xs" title="Оценено полностью">
              Оценено {{ progress(group) }}
            </span>
          </div>

          <p class="text-sm">
            <span class="text-ink-soft">Эксперты: </span>
            {{ group.experts.length ? group.experts.map((expert) => expert.name).join(", ") : "не назначены" }}
          </p>

          <p v-if="group.stale" class="text-danger flex items-start gap-1.5 text-sm">
            <TriangleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Место или время изменились после рассылки — кандидаты видят прежние. Сообщите группе снова.
          </p>
          <p v-else-if="group.notifiedAt" class="text-ok text-sm">Группе сообщили {{ mskFormat(group.notifiedAt, "d MMMM, HH:mm") }}</p>
          <p v-else-if="data?.manage" class="text-ink-soft text-sm">Кандидатам ещё не сообщили место.</p>

          <details class="group/members">
            <summary class="flex min-h-10 cursor-pointer items-center gap-2 text-sm font-medium">
              <UsersRound class="size-4" aria-hidden="true" /> Кандидаты: {{ group.members.length }}
              <ChevronDown class="text-ink-soft size-4 transition-transform group-open/members:rotate-180" aria-hidden="true" />
            </summary>
            <ul class="mt-2 flex flex-col divide-y divide-line">
              <li v-for="member in group.members" :key="member.applicationId" class="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span class="text-sm">
                  {{ member.name }}
                  <span class="text-ink-soft text-xs">· оценок {{ member.done }} из {{ member.total }}</span>
                </span>
                <UiSelect
                  v-if="data?.manage"
                  size="sm"
                  :model-value="group.id"
                  :disabled="busy === `m:${member.applicationId}`"
                  :aria-label="`Группа: ${member.name}`"
                  @change="move(member.applicationId, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="option in data.groups" :key="option.id" :value="option.id">{{ option.title }}</option>
                  <option value="">Убрать из групп</option>
                </UiSelect>
              </li>
              <li v-if="group.members.length === 0" class="text-ink-soft py-2 text-sm">Пока никого.</li>
            </ul>
          </details>

          <div class="mt-auto grid gap-2 sm:grid-cols-2">
            <UiButton v-if="canOpen(group)" class="sm:col-span-2" :href="`/staff/assessment/${group.id}`">
              Оценивать <ChevronRight class="size-4" aria-hidden="true" />
            </UiButton>
            <template v-if="data?.manage">
              <UiButton
                variant="ghost"
                :pending="busy === `n:${group.id}`"
                :disabled="group.members.length === 0 || (Boolean(group.notifiedAt) && !group.stale)"
                @click="act(`n:${group.id}`, '/api/staff/assessment/notify', { groupId: group.id })"
              >
                <BellRing class="size-4" aria-hidden="true" /> {{ group.stale ? "Сообщить об изменении" : "Сообщить группе" }}
              </UiButton>
              <UiButton variant="ghost" @click="editing = group.id"><Pencil class="size-4" aria-hidden="true" /> Изменить</UiButton>
              <UiButton
                v-if="group.members.length === 0"
                variant="ghost"
                :pending="busy === `d:${group.id}`"
                @click="act(`d:${group.id}`, '/api/staff/assessment/group-delete', { id: group.id })"
              >
                <Trash2 class="size-4" aria-hidden="true" /> Удалить
              </UiButton>
            </template>
          </div>
        </template>
      </article>
    </div>

    <!-- Без группы -->
    <section v-if="data?.manage && data.free.length" class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
      <h2 class="font-display text-xl">Без группы: {{ data.free.length }}</h2>
      <p class="text-ink-soft text-sm">Все, кто отправил анкету. «Разложить поровну» добавит их в самые маленькие группы.</p>
      <ul class="flex flex-col divide-y divide-line">
        <li v-for="person in data.free" :key="person.applicationId" class="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
          <span class="text-sm">{{ person.name }}</span>
          <UiSelect
            v-if="data.groups.length"
            size="sm"
            model-value=""
            :disabled="busy === `m:${person.applicationId}`"
            :aria-label="`В группу: ${person.name}`"
            @change="move(person.applicationId, ($event.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>В группу…</option>
            <option v-for="option in data.groups" :key="option.id" :value="option.id">{{ option.title }}</option>
          </UiSelect>
        </li>
      </ul>
    </section>
  </main>
</template>
