<script setup lang="ts">
import { CalendarPlus, MapPin, Trash2 } from "lucide-vue-next";
import type { ScheduleSlot } from "~~/lib/interviews/slots";
import { facultyMatches } from "~~/lib/profile/faculty";

definePageMeta({ layout: "staff" });
useHead({ title: "Собеседования" });
const { data: nav } = await useFetch("/api/staff/nav", { key: "staff-nav" });
const canManage = computed(() => nav.value?.can.interviews ?? false);
const showArchived = ref(false);
const { data, refresh } = await useFetch<{ slots: ScheduleSlot[] }>("/api/staff/interviews", { query: { archived: computed(() => showArchived.value ? "1" : undefined) } });
const { data: pool } = await useFetch<{ people: { id: string; name: string }[] }>("/api/staff/interviewers", { immediate: canManage.value });
const session = await useSession();
const canMessage = computed(() => session.value?.isOwner || session.value?.permissions.includes("messages.reply"));
const message = useAction("/api/staff/messages/open");
async function writeTo(applicationId: string) { const result = await message.submit({ applicationId }); if (result.ok && typeof result.threadId === "string") await navigateTo(`/staff/messages?thread=${result.threadId}`); }
const onlyMine = ref(false);
const faculty = useFacultyFilter();
const route = useRoute();
const router = useRouter();
const campus = computed({
  get: () => typeof route.query.campus === "string" ? route.query.campus : "",
  set: (value: string) => { void router.replace({ query: { ...route.query, campus: value || undefined } }); },
});
const campuses = computed(() => [...new Set((data.value?.slots ?? []).map(slot => slot.location))].sort((a, b) => a.localeCompare(b, "ru")));
const master = computed({
  get: () => typeof route.query.master === "string" ? route.query.master : "",
  set: (value: string) => { void router.replace({ query: { ...route.query, master: value || undefined } }); },
});
const masters = computed(() => [...new Map((data.value?.slots ?? []).flatMap(s => s.interviewers).map(person => [person.id, person])).values()].sort((a, b) => a.name.localeCompare(b.name, "ru")));
const form = reactive({ date: "2026-11-02", from: "08:30", to: "10:00", duration: 45, gap: 5, location: "", interviewerId: "" });
const week = Array.from({ length: 7 }, (_, i) => `2026-11-${String(i + 2).padStart(2, '0')}`);
const dates = computed(() => [...new Set([...week, ...(data.value?.slots.map(s => mskDayKey(s.startsAt)) ?? [])])].sort());
const dateLabel = (date: string) => mskFormat(`${date}T12:00:00+03:00`, "EEE, d MMM");
const shown = computed(() => (data.value?.slots ?? []).filter(slot => mskDayKey(slot.startsAt) === form.date && (!onlyMine.value || slot.mine) && (!campus.value || slot.location === campus.value) && (!master.value || slot.interviewers.some(p => p.id === master.value))).map(slot => ({ ...slot, bookings: slot.bookings.filter(b => facultyMatches(b.faculty, faculty.value)) })).filter(slot => !faculty.value || slot.bookings.length));
const stats = computed(() => ({ slots: data.value?.slots.length ?? 0, booked: data.value?.slots.reduce((n,s) => n + s.bookings.length, 0) ?? 0 }));
const cut = useAction("/api/staff/interviews/slots");
async function createSlots() {
  const { interviewerId, ...values } = form;
  const result = await cut.submit({ ...values, capacity: 1, interviewerIds: [interviewerId] });
  if (result.ok) await refresh();
}
const editingSlot = ref<string | null>(null);
const slotPerson = ref("");
const saveSlot = useAction("/api/staff/interviews/slot-interviewers");
function editMaster(slot: ScheduleSlot) { editingSlot.value = editingSlot.value === slot.id ? null : slot.id; slotPerson.value = slot.interviewers[0]?.id ?? ""; }
async function saveMaster(slotId: string) { const result = await saveSlot.submit({ slotId, interviewerIds: [slotPerson.value] }); if (result.ok) { editingSlot.value = null; await refresh(); } }
const roomSlot = ref<string | null>(null);
const room = ref("");
const roomAction = useAction("/api/staff/interviews/room");
function editRoom(slot: ScheduleSlot) { roomSlot.value = roomSlot.value === slot.id ? null : slot.id; room.value = slot.room ?? ""; }
async function saveRoom(slotId: string) { const result = await roomAction.submit({ slotId, room: room.value || null }); if (result.ok) { roomSlot.value = null; await refresh(); } }
const editingBooking = ref<string | null>(null);
const targetSlot = ref("");
const restoreChange = ref(false);
const move = useAction("/api/staff/interviews/booking");
function editBooking(applicationId: string, slotId: string) { editingBooking.value = editingBooking.value === applicationId ? null : applicationId; targetSlot.value = slotId; restoreChange.value = false; }
const targets = computed(() => (data.value?.slots ?? []).filter(s => new Date(s.startsAt).getTime() > Date.now() && s.capacity === 1 && s.interviewers.length === 1 && (!s.bookings.length || s.bookings.some(b => b.applicationId === editingBooking.value))));
async function moveBooking(applicationId: string) { const result = await move.submit({ applicationId, slotId: targetSlot.value || null, restoreChange: Boolean(targetSlot.value) && restoreChange.value }); if (result.ok) { editingBooking.value = null; await refresh(); } }
const remove = useAction("/api/staff/interviews/delete");
const restore = useAction("/api/staff/interviews/restore");
async function restoreSlot(slotId: string) { const result = await restore.submit({ slotId }); if (result.ok) await refresh(); }
async function deleteSlot(slotId: string) { const result = await remove.submit({ slotId }); if (result.ok) await refresh(); }
</script>

<template>
  <main class="mx-auto grid max-w-6xl gap-6 px-4 py-8" :class="canManage ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''">
    <section class="flex min-w-0 flex-col gap-4">
      <div class="flex flex-col gap-2">
        <h1 class="font-display text-3xl">Собеседования</h1>
        <p class="text-ink-soft text-sm">2–8 ноября. Слотов {{ stats.slots }}, записались {{ stats.booked }}. В каждом слоте один мастер и один кандидат. Перезапись кандидата — один раз, до 18:00 предыдущего дня по Москве.</p>
      </div>
      <StaffInterviewInvitations v-if="canManage" />
      <StaffReserveInterviewInvitations v-if="canManage" />
      <StaffInterviewScheduleImport v-if="canManage && pool" :people="pool.people" @saved="refresh()" />
      <UiNotice :ok="message.result.value?.ok" :message="message.result.value?.message" />
      <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <UiCheckbox v-model="onlyMine">Только мои собеседования</UiCheckbox>
        <StaffFacultyFilter v-model="faculty" />
        <label class="flex min-w-0 flex-col gap-1 text-sm sm:max-w-xs">Мастер отбора
          <UiSelect v-model="master" size="md" aria-label="Мастер отбора в расписании"><option value="">Все мастера отбора</option><option v-for="person in masters" :key="person.id" :value="person.id">{{ person.name }}</option></UiSelect>
        </label>
        <label class="flex min-w-0 flex-col gap-1 text-sm sm:max-w-xs">
          Корпус
          <UiSelect v-model="campus" size="md" aria-label="Корпус собеседования">
            <option value="">Все корпуса</option>
            <option v-for="place in campuses" :key="place" :value="place">{{ place }}</option>
          </UiSelect>
        </label>
        <UiCheckbox v-if="canManage" v-model="showArchived">Снятые слоты</UiCheckbox>
      </div>
      <div class="flex flex-wrap gap-2" role="group" aria-label="Дни собеседований">
        <button v-for="date in dates" :key="date" type="button" :aria-pressed="form.date === date" class="border-line min-h-11 rounded-xl border px-3 py-2 text-sm" :class="form.date === date ? 'bg-ink text-paper' : 'bg-card hover:border-accent'" @click="form.date = date">{{ dateLabel(date) }}</button>
      </div>
      <h2 class="font-semibold">{{ dateLabel(form.date) }}</h2>
      <UiNotice v-for="(action, i) in [remove, saveSlot, roomAction, move, restore]" :key="i" :ok="action.result.value?.ok" :message="action.result.value?.message" />
      <p v-if="!shown.length" class="bg-card border-line text-ink-soft rounded-3xl border p-6 text-sm">{{ onlyMine || faculty || campus || master || showArchived ? 'По выбранным фильтрам собеседований нет.' : 'На этот день слотов пока нет. Добавьте корпус, время и мастера.' }}</p>
      <ul v-else class="bg-card border-line overflow-hidden rounded-3xl border">
        <li v-for="slot in shown" :key="slot.id" class="border-line flex flex-col gap-3 border-t p-4 first:border-t-0" :class="slot.mine ? 'bg-brand-green-soft/30' : ''">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div class="flex min-w-0 flex-col gap-1">
              <p class="font-semibold">{{ mskTime(slot.startsAt) }}–{{ mskTime(slot.endsAt) }}</p>
              <p class="flex items-start gap-1 text-sm"><MapPin class="size-4 shrink-0" aria-hidden="true" />{{ slot.location }}</p>
              <p class="text-ink-soft text-sm">{{ slot.room ? `Аудитория ${slot.room}` : 'Аудитория уточняется' }}</p>
              <p class="text-ink-soft text-xs">{{ slot.interviewers.map(p => p.name).join(', ') || 'Мастер не назначен' }}</p>
              <p v-if="slot.interviewers.length !== 1 || slot.capacity !== 1" class="text-danger text-xs">Старый формат слота — уточните состав и разнесите записи.</p>
            </div>
            <button v-if="canManage && !slot.archivedAt && !slot.bookings.length" type="button" class="text-danger grid size-10 place-items-center" aria-label="Удалить слот" @click="deleteSlot(slot.id)"><Trash2 class="size-4" aria-hidden="true" /></button>
          </div>
          <div v-for="booking in slot.bookings" :key="booking.applicationId" class="flex flex-col gap-2">
            <NuxtLink :to="`/staff/applications/${booking.applicationId}?stage=INTERVIEW&from=all`" class="text-sm font-semibold hover:underline">{{ booking.name }}<span class="text-ink-soft font-normal">{{ booking.faculty ? ` · ${booking.faculty}` : '' }}</span></NuxtLink>
            <p v-if="booking.scoreSummary.length" class="text-ink-soft text-xs">{{ booking.scoreSummary.map(s => `${s.label}: ${s.percent === null ? 'нет полной оценки' : `${s.percent}%`}`).join(' · ') }}</p>
            <div class="flex flex-wrap gap-3"><button v-if="canMessage" type="button" class="text-accent text-sm hover:underline" :disabled="message.pending.value" @click="writeTo(booking.applicationId)">{{ booking.hasTelegram ? 'Написать в Telegram' : 'Написать' }}</button><NuxtLink :to="`/staff/applications/${booking.applicationId}?stage=INTERVIEW&from=all#previous-reviews`" class="text-accent text-sm hover:underline">Оценки и комментарии</NuxtLink></div>
            <p class="text-ink-soft text-xs">{{ booking.reschedulesUsed >= 1 ? 'Самостоятельная перезапись использована' : 'Самостоятельная перезапись ещё не использована' }}</p>
            <button v-if="canManage" type="button" class="text-accent self-start text-sm hover:underline" @click="editBooking(booking.applicationId, slot.id)">Изменить запись</button>
            <form v-if="canManage && editingBooking === booking.applicationId" class="bg-paper flex flex-col gap-3 rounded-2xl p-3" @submit.prevent="moveBooking(booking.applicationId)">
              <label class="flex flex-col gap-1 text-sm">Новое время<UiSelect v-model="targetSlot" aria-label="Новое время"><option value="">Отменить запись</option><option v-for="target in targets" :key="target.id" :value="target.id">{{ mskFormat(target.startsAt, 'd MMM, HH:mm') }} · {{ target.location }} · {{ target.interviewers[0]?.name }}</option></UiSelect></label>
              <UiCheckbox v-model="restoreChange" :disabled="!targetSlot">Восстановить право на одну самостоятельную перезапись</UiCheckbox>
              <p class="text-ink-soft text-xs">Участник получит уведомление. Изменение сохранится в журнале.</p>
              <UiButton type="submit" :pending="move.pending.value">Сохранить запись</UiButton>
            </form>
          </div>
          <p v-if="!slot.bookings.length" class="text-ink-soft text-sm">{{ slot.archivedAt ? 'Снят с записи — история сохранена' : 'Свободно' }}</p>
          <UiButton v-if="canManage && slot.archivedAt" :pending="restore.pending.value" @click="restoreSlot(slot.id)">Восстановить слот</UiButton>
          <div v-if="!slot.archivedAt" class="flex flex-wrap gap-3">
            <button v-if="canManage || slot.mine" type="button" class="text-accent min-h-9 text-sm hover:underline" @click="editRoom(slot)">Указать аудиторию</button>
            <button v-if="canManage" type="button" class="text-accent min-h-9 text-sm hover:underline" @click="editMaster(slot)">Изменить мастера</button>
          </div>
          <form v-if="roomSlot === slot.id" class="bg-paper flex flex-col gap-3 rounded-2xl p-3" @submit.prevent="saveRoom(slot.id)">
            <label class="flex flex-col gap-1 text-sm">Аудитория<input v-model="room" maxlength="100" placeholder="Например, 602" class="border-line bg-card min-h-11 rounded-xl border px-3 text-base" ></label>
            <p class="text-ink-soft text-xs">Записанные участники сразу получат уведомление.</p>
            <UiButton type="submit" :pending="roomAction.pending.value">Сохранить аудиторию</UiButton>
          </form>
          <form v-if="editingSlot === slot.id" class="bg-paper flex flex-col gap-3 rounded-2xl p-3" @submit.prevent="saveMaster(slot.id)">
            <label class="flex flex-col gap-1 text-sm">Мастер отбора<UiSelect v-model="slotPerson" aria-label="Мастер слота"><option value="" disabled>Выберите мастера</option><option v-for="person in pool?.people ?? []" :key="person.id" :value="person.id">{{ person.name }}</option></UiSelect></label>
            <p class="text-ink-soft text-xs">Начатые оценки прежнего мастера сохранятся.</p>
            <UiButton type="submit" :pending="saveSlot.pending.value" :disabled="!slotPerson">Сохранить мастера</UiButton>
          </form>
        </li>
      </ul>
    </section>
    <aside v-if="canManage" class="min-w-0">
      <form class="bg-card border-line flex flex-col gap-4 rounded-3xl border p-5" @submit.prevent="createSlots">
        <h2 class="font-display flex items-center gap-2 text-lg"><CalendarPlus class="size-5" aria-hidden="true" />Добавить расписание мастера</h2>
        <UiDateTime v-model="form.date" mode="date" size="md" label="День" />
        <label class="flex flex-col gap-1 text-sm">Корпус (адрес)<input v-model="form.location" maxlength="300" placeholder="Например, Ленинградский проспект" class="border-line bg-paper min-h-11 rounded-xl border px-3 text-base" ></label>
        <label class="flex flex-col gap-1 text-sm">Мастер отбора<UiSelect v-model="form.interviewerId" aria-label="Мастер отбора"><option value="" disabled>Выберите одного мастера</option><option v-for="person in pool?.people ?? []" :key="person.id" :value="person.id">{{ person.name }}</option></UiSelect></label>
        <div class="grid grid-cols-2 gap-3"><UiTime v-model="form.from" label="С" /><UiTime v-model="form.to" label="До" /></div>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1 text-sm">Минут на одного<input v-model.number="form.duration" type="number" min="5" max="240" class="border-line bg-paper min-h-11 w-full rounded-xl border px-3 text-base" ></label>
          <label class="flex flex-col gap-1 text-sm">Перерыв, мин<input v-model.number="form.gap" type="number" min="5" max="120" class="border-line bg-paper min-h-11 w-full rounded-xl border px-3 text-base" ></label>
        </div>
        <p class="text-ink-soft text-xs">Время московское. Аудиторию мастер сможет указать позже. Для другого мастера или корпуса добавьте отдельный интервал.</p>
        <UiNotice :ok="cut.result.value?.ok" :message="cut.result.value?.message" />
        <UiButton type="submit" :pending="cut.pending.value" :disabled="!form.date || !form.location.trim() || !form.interviewerId">Создать слоты</UiButton>
      </form>
    </aside>
  </main>
</template>
