<script setup lang="ts">
import { BellRing, ChevronRight, MailPlus, MapPin, Pencil, Plus, Trash2 } from "lucide-vue-next";
import type { ActionResult } from "~/composables/useAction";
import { canChangeAnswer, mskDayKey, placeLine } from "~~/lib/assessment/rules";

definePageMeta({ layout: "staff" });
useHead({ title: "Центр оценки" });
interface Group { id: string; title: string; faculty: string | null; experts: { id: string; name: string }[]; members: number; done: number }
interface SessionRow {
  id: string; title: string; building: string | null; room: string | null; startsAt: string; note: string | null;
  faculties: string[]; reserve: boolean; capacity: number; occupied: number; invitedAt: string | null; stale: boolean;
  counts: { invited: number; going: number; reserve: number; cant: number; silent: number }; groups: Group[];
}
interface Overview {
  manage: boolean; viewAll: boolean; me: string; year: number; criteria: number; sessions: SessionRow[];
  notInvited: number; noFaculty: number; hasReserve: boolean;
  reserveQueue: { applicationId: string; name: string; faculty: string | null; queuedAt: string | null; offered: boolean }[];
}
const { data, refresh } = await useFetch<Overview>("/api/staff/assessment");
const editing = ref<string | null>(null);
const edited = computed(() => data.value?.sessions.find((slot) => slot.id === editing.value) ?? null);
// Форма — вверху страницы; кнопка «Изменить» — у времени ниже. Прокручиваем к форме, иначе кажется, что ничего не произошло.
const editForm = ref<HTMLElement | null>(null);
watch(editing, async (value) => {
  if (!value) return;
  await nextTick();
  editForm.value?.scrollIntoView({ behavior: "smooth", block: "start" });
});
const notice = ref<ActionResult | null>(null);
const busy = ref<string | null>(null);
const confirmDelete = ref<string | null>(null);
const schedule = computed(() => {
  const sessions = data.value?.sessions ?? [];
  const year = data.value?.year ?? 2026;
  const days = [...new Set([...Array.from({ length: 6 }, (_, i) => `${year}-10-${26 + i}`), ...sessions.map((slot) => mskDayKey(slot.startsAt))])].sort();
  return days.map((date) => {
    const slots = sessions.filter((slot) => mskDayKey(slot.startsAt) === date);
    const faculties = [...new Set(slots.flatMap((slot) => slot.faculties.length ? slot.faculties : ["Все факультеты"]))];
    return { date, reserve: date.endsWith("10-31") || slots.some((slot) => slot.reserve), faculties: faculties.map((faculty) => {
      const times = slots.filter((slot) => slot.faculties.includes(faculty) || (faculty === "Все факультеты" && slot.faculties.length === 0));
      return { faculty, slots: times, target: times.find((slot) => canChangeAnswer(new Date(), slot.startsAt)) ?? times[0]! };
    }) };
  });
});
const waiting = computed(() => data.value?.reserveQueue.filter((person) => !person.offered).length ?? 0);
const canOpen = (group: Group) => data.value?.viewAll || group.experts.some((expert) => expert.id === data.value?.me);
async function act(key: string, url: string, body: Record<string, unknown>) {
  busy.value = key;
  try {
    notice.value = await $fetch<ActionResult>(url, { method: "POST", body, ignoreResponseError: true }).catch(() => ({ ok: false, message: "Нет связи с сайтом. Проверьте интернет." }));
    if (notice.value.ok) { await refresh(); void refreshNuxtData("staff-nav"); }
  } finally { busy.value = null; }
}
async function saved() { editing.value = null; notice.value = { ok: true, message: "Время ЦО сохранено. Кандидаты выбирают его самостоятельно." }; await refresh(); }
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <header class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div class="min-w-0">
        <h1 class="font-display text-3xl">Центр оценки</h1>
        <p class="text-ink-soft mt-2 max-w-2xl text-sm">День → факультет → время → подгруппы. Приглашаем на день и факультет, кандидаты сами выбирают время. Место занимает только подтверждённая запись.</p>
        <p v-if="data?.manage" class="text-ink-soft mt-2 text-sm">Времён: {{ data.sessions.length }} · ещё не приглашены: {{ data.notInvited }}<template v-if="data.noFaculty"> · без факультета: {{ data.noFaculty }} (пригласите вручную на странице времени)</template></p>
      </div>
      <div v-if="data?.manage" class="shrink-0"><UiButton @click="editing = 'new'"><Plus class="size-4" aria-hidden="true" /> Добавить время</UiButton></div>
    </header>
    <p v-if="data?.criteria === 0" class="bg-brand-yellow-soft rounded-2xl p-4 text-sm">У этапа нет критериев — добавьте их в «Админка → Анкета и оценка → Оценка ЦО».</p>
    <UiNotice :ok="notice?.ok" :message="notice?.message" />
    <section v-if="editing && data?.manage" ref="editForm" class="bg-card border-line scroll-mt-4 rounded-3xl border p-5">
      <h2 class="font-display mb-4 text-xl">{{ editing === 'new' ? 'Новое время ЦО' : 'Редактировать время' }}</h2>
      <StaffAssessmentSessionForm :key="editing" :session="edited" :has-reserve="data.hasReserve" @saved="saved" @cancel="editing = null" />
    </section>

    <section v-if="data && (data.manage || data.viewAll)" class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5" aria-labelledby="reserve-queue-title">
      <h2 id="reserve-queue-title" class="font-display text-xl">Очередь резервного дня · {{ data.reserveQueue.length }}</h2>
      <p class="text-ink-soft text-sm">Ждут выбора времени: {{ data.reserveQueue.length }}. Из них ещё не получили рассылку: {{ waiting }}. Рассылка предлагает времена резерва и не занимает места автоматически.</p>
      <div v-if="data.manage" class="self-start"><UiButton :pending="busy === 'reserve-queue'" :disabled="!data.hasReserve || !waiting || busy !== null" @click="act('reserve-queue', '/api/staff/assessment/reserve-invite', {})"><MailPlus class="size-4" aria-hidden="true" /> Пригласить из очереди</UiButton></div>
      <p v-if="!data.hasReserve" class="text-ink-soft text-sm">Времена резервного дня пока не созданы. Очередь сохранена.</p>
      <details v-if="data.reserveQueue.length"><summary class="min-h-11 cursor-pointer py-2 text-sm font-semibold">Показать ожидающих</summary>
        <ol class="mt-2 flex max-h-80 flex-col gap-2 overflow-y-auto"><li v-for="(person, index) in data.reserveQueue" :key="person.applicationId" class="bg-paper rounded-2xl px-3 py-2 text-sm break-words">
          {{ index + 1 }}. {{ person.name }} · {{ person.faculty ?? 'без факультета' }}<span class="text-ink-soft block text-xs">{{ person.offered ? 'Предложение отправлено — выбирает время' : 'Ждёт рассылки' }}</span>
        </li></ol>
      </details>
    </section>

    <section v-for="day in schedule" :key="day.date" class="flex flex-col gap-4" :aria-label="mskFormat(`${day.date}T12:00:00Z`, 'EEEE, d MMMM')">
      <h2 class="font-display border-line flex flex-wrap items-center gap-2 border-b pb-3 text-2xl"><span class="inline-block first-letter:uppercase">{{ mskFormat(`${day.date}T12:00:00Z`, "EEEE, d MMMM") }}</span><span v-if="day.reserve" class="bg-brand-yellow-soft rounded-xl px-3 py-1 text-sm">Резервный день</span></h2>
      <p v-if="!day.faculties.length" class="text-ink-soft text-sm">{{ data?.manage ? 'Времена пока не созданы. Добавьте время, аудиторию и факультеты.' : 'Нет доступных вам подгрупп в этот день.' }}</p>
      <section v-for="block in day.faculties" :key="block.faculty" class="flex min-w-0 flex-col gap-3">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h3 class="font-display text-xl">{{ block.faculty }}</h3>
          <div v-if="data?.manage" class="shrink-0"><UiButton variant="ghost" :pending="busy === `invite:${day.date}:${block.faculty}`" :disabled="busy !== null || !block.slots.some((slot) => canChangeAnswer(new Date(), slot.startsAt))" @click="act(`invite:${day.date}:${block.faculty}`, '/api/staff/assessment/invite', { sessionId: block.target.id, ...(block.faculty !== 'Все факультеты' ? { faculty: block.faculty } : {}) })"><MailPlus class="size-4" aria-hidden="true" /> Пригласить на этот день</UiButton></div>
        </div>
        <div class="grid gap-4 lg:grid-cols-2">
          <article v-for="session in block.slots" :key="session.id" class="bg-card border-line flex min-w-0 flex-col gap-3 rounded-3xl border p-5">
            <h4 class="font-display text-xl">{{ mskTime(session.startsAt) }} МСК</h4>
            <p class="text-ink-soft text-sm break-words">{{ session.title }}</p>
            <p class="flex items-start gap-2 text-sm"><MapPin class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ placeLine(session) || 'Место не указано' }}</p>
            <p class="text-sm font-semibold" :class="session.occupied >= session.capacity ? 'text-danger' : 'text-ink'">Записано: {{ session.occupied }} / {{ session.capacity }}{{ session.occupied >= session.capacity ? ' — все места заняты' : '' }}</p>
            <p v-if="session.faculties.length > 1" class="text-ink-soft text-xs">Общий слот для {{ session.faculties.join(' и ') }}. Лимит общий, не на каждый факультет отдельно.</p>
            <p v-if="data?.manage || data?.viewAll" class="text-ink-soft text-xs">Приглашений-опор: {{ session.counts.invited }} · ещё выбирают: {{ session.counts.silent }} · в резерв: {{ session.counts.reserve }} · отказались: {{ session.counts.cant }}</p>
            <p v-if="session.stale" class="text-danger text-sm">Место или время изменены — кандидаты видят прежние данные. Сообщите об изменении.</p>
            <ul v-if="session.groups.length" class="flex flex-col gap-2">
              <li v-for="group in session.groups.filter((group) => !group.faculty || group.faculty === block.faculty || block.faculty === 'Все факультеты')" :key="group.id" class="bg-paper rounded-2xl p-3 text-sm">
                <p class="font-semibold">{{ group.title }}<span v-if="group.faculty"> · {{ group.faculty }}</span></p><p class="text-ink-soft text-xs">{{ group.experts.map((expert) => expert.name).join(', ') || 'Эксперты не назначены' }} · оценено {{ group.done }} / {{ group.members }}</p>
                <NuxtLink v-if="canOpen(group)" :to="`/staff/assessment/${group.id}`" class="text-accent mt-2 inline-flex min-h-9 items-center gap-1 font-semibold">Оценивать <ChevronRight class="size-4" aria-hidden="true" /></NuxtLink>
              </li>
            </ul>
            <div v-if="data?.manage || data?.viewAll" class="mt-auto flex flex-col gap-2">
              <UiButton :href="`/staff/assessment/session/${session.id}`">Записи, сообщения и подгруппы <ChevronRight class="size-4" aria-hidden="true" /></UiButton>
              <template v-if="data?.manage">
                <UiButton v-if="session.stale" variant="ghost" :pending="busy === `change:${session.id}`" @click="act(`change:${session.id}`, '/api/staff/assessment/notify-change', { sessionId: session.id })"><BellRing class="size-4" aria-hidden="true" /> Сообщить об изменении</UiButton>
                <UiButton variant="ghost" :pending="busy === `remind:${session.id}`" :disabled="session.counts.silent === 0" @click="act(`remind:${session.id}`, '/api/staff/assessment/remind', { sessionId: session.id })">Напомнить выбрать время</UiButton>
                <div class="flex flex-wrap gap-2"><UiButton variant="ghost" @click="editing = session.id"><Pencil class="size-4" aria-hidden="true" /> Изменить</UiButton><UiButton variant="ghost" @click="confirmDelete = session.id"><Trash2 class="size-4" aria-hidden="true" /> Удалить</UiButton></div>
                <div v-if="confirmDelete === session.id" class="bg-brand-red-soft rounded-2xl p-3 text-sm" role="alertdialog" :aria-label="`Удалить ${session.title}?`"><p>Удалить время и его приглашения/подгруппы? Начатые оценки сохранятся.</p><div class="mt-2 flex flex-wrap gap-2"><UiButton :pending="busy === `delete:${session.id}`" @click="act(`delete:${session.id}`, '/api/staff/assessment/session-delete', { id: session.id }); confirmDelete = null">Да, удалить</UiButton><UiButton variant="ghost" @click="confirmDelete = null">Отмена</UiButton></div></div>
              </template>
            </div>
          </article>
        </div>
      </section>
    </section>
  </main>
</template>
