<script setup lang="ts">
import { CalendarPlus, MapPin, Trash2 } from "lucide-vue-next";

import type { ScheduleSlot } from "~~/lib/interviews/slots";

/**
 * «Собеседования»: расписание по дням и нарезка слотов. Кандидаты
 * записываются сами; собеседующим запись появляется здесь и в списке
 * оценок, а за час приходит напоминание.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Собеседования" });

const { data: nav } = await useFetch("/api/staff/nav", { key: "staff-nav" });
const canManage = computed(() => nav.value?.can.interviews ?? false);

const { data, refresh } = await useFetch<{ slots: ScheduleSlot[] }>("/api/staff/interviews");
const onlyMine = ref(false);

const days = computed(() => {
  const slots = (data.value?.slots ?? []).filter((slot) => !onlyMine.value || slot.mine);
  const groups: { key: string; day: Date | string; slots: ScheduleSlot[] }[] = [];
  for (const slot of slots) {
    const key = mskDayKey(slot.startsAt);
    const last = groups.at(-1);
    if (last?.key === key) last.slots.push(slot);
    else groups.push({ key, day: slot.startsAt, slots: [slot] });
  }
  return groups;
});

const stats = computed(() => {
  const slots = data.value?.slots ?? [];
  const capacity = slots.reduce((sum, slot) => sum + slot.capacity, 0);
  const booked = slots.reduce((sum, slot) => sum + slot.bookings.length, 0);
  return { slots: slots.length, capacity, booked };
});

// --- Нарезка слотов ---------------------------------------------------------
const { data: pool } = await useFetch<{ people: { id: string; name: string }[] }>("/api/staff/interviewers", {
  immediate: canManage.value,
});
const form = reactive({
  date: "",
  from: "10:00",
  to: "13:00",
  duration: 20,
  gap: 10,
  capacity: 1,
  location: "",
  interviewerIds: [] as string[],
});
const cut = useAction("/api/staff/interviews/slots");
async function createSlots() {
  const result = await cut.submit({ ...form });
  if (result.ok) await refresh();
}

const remove = useAction("/api/staff/interviews/delete");
async function deleteSlot(slotId: string) {
  const result = await remove.submit({ slotId });
  if (result.ok) await refresh();
}

const time = mskTime;
</script>

<template>
  <main class="mx-auto grid max-w-6xl gap-6 px-4 py-8" :class="canManage ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''">
    <section class="flex min-w-0 flex-col gap-4">
      <div class="flex flex-col gap-1">
        <h1 class="font-display text-3xl">Собеседования</h1>
        <p class="text-ink-soft text-sm">
          Слотов {{ stats.slots }}, мест {{ stats.capacity }}, записались {{ stats.booked }}. Кандидаты выбирают время
          сами и могут перенести его не позже чем за 12 часов.
        </p>
      </div>

      <label class="flex items-center gap-2 self-start text-sm">
        <input v-model="onlyMine" type="checkbox" class="accent-accent size-4" >
        Только мои собеседования
      </label>

      <UiNotice v-if="remove.result.value && !remove.result.value.ok" :message="remove.result.value.message" />

      <div v-for="group in days" :key="group.key" class="flex flex-col gap-2">
        <h2 class="font-semibold first-letter:uppercase">{{ mskDay(group.day) }}</h2>
        <ul class="bg-card border-line overflow-hidden rounded-3xl border">
          <li
            v-for="slot in group.slots"
            :key="slot.id"
            class="border-line flex flex-col gap-2 border-t px-4 py-3 first:border-t-0 sm:flex-row sm:items-center sm:gap-4"
            :class="slot.mine ? 'bg-brand-green-soft/30' : ''"
          >
            <div class="w-28 shrink-0">
              <p class="font-semibold">{{ time(slot.startsAt) }}–{{ time(slot.endsAt) }}</p>
              <p class="text-ink-soft flex items-center gap-1 truncate text-xs"><MapPin class="size-3" aria-hidden="true" />{{ slot.location }}</p>
            </div>
            <div class="min-w-0 flex-1">
              <template v-if="slot.bookings.length">
                <NuxtLink
                  v-for="booking in slot.bookings"
                  :key="booking.applicationId"
                  :to="`/staff/applications/${booking.applicationId}?stage=INTERVIEW&from=all`"
                  class="block truncate text-sm font-semibold hover:underline"
                >
                  {{ booking.name }}<span v-if="booking.telegramUsername" class="text-ink-soft font-normal"> · @{{ booking.telegramUsername }}</span>
                </NuxtLink>
              </template>
              <p v-else class="text-ink-soft text-sm">Свободно<template v-if="slot.capacity > 1"> · мест {{ slot.capacity }}</template></p>
              <p class="text-ink-soft truncate text-xs">{{ slot.interviewers.map((person) => person.name).join(", ") }}</p>
            </div>
            <button
              v-if="canManage && slot.bookings.length === 0"
              type="button"
              class="text-ink-soft hover:text-danger grid size-9 place-items-center self-end rounded-xl sm:self-auto"
              aria-label="Удалить слот"
              @click="deleteSlot(slot.id)"
            >
              <Trash2 class="size-4" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </div>

      <p v-if="days.length === 0" class="bg-card border-line text-ink-soft rounded-3xl border p-8 text-center text-sm">
        {{ onlyMine ? "Вас пока нет ни в одном слоте." : "Слотов пока нет." }}
      </p>
    </section>

    <aside v-if="canManage">
      <form class="bg-card border-line flex flex-col gap-4 rounded-3xl border p-5 lg:sticky lg:top-4" @submit.prevent="createSlots">
        <div class="flex items-center gap-2">
          <CalendarPlus class="size-5" aria-hidden="true" />
          <h2 class="font-display text-lg">Нарезать слоты</h2>
        </div>
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          День
          <input v-model="form.date" type="date" class="border-line bg-paper min-h-11 rounded-xl border px-3 text-base" >
        </label>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1.5 text-sm font-medium">С<input v-model="form.from" type="time" class="border-line bg-paper min-h-11 rounded-xl border px-3 text-base" ></label>
          <label class="flex flex-col gap-1.5 text-sm font-medium">До<input v-model="form.to" type="time" class="border-line bg-paper min-h-11 rounded-xl border px-3 text-base" ></label>
          <label class="flex flex-col gap-1.5 text-sm font-medium">Минут на одного<input v-model.number="form.duration" type="number" min="5" class="border-line bg-paper min-h-11 rounded-xl border px-3 text-base" ></label>
          <label class="flex flex-col gap-1.5 text-sm font-medium">Перерыв, мин<input v-model.number="form.gap" type="number" min="0" class="border-line bg-paper min-h-11 rounded-xl border px-3 text-base" ></label>
        </div>
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          Место или ссылка
          <input v-model="form.location" placeholder="Ауд. 301 или ссылка на звонок" class="border-line bg-paper min-h-11 rounded-xl border px-3 text-base" >
        </label>
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          Кандидатов в слоте
          <input v-model.number="form.capacity" type="number" min="1" max="20" class="border-line bg-paper min-h-11 w-24 rounded-xl border px-3 text-base" >
        </label>
        <fieldset class="flex flex-col gap-2">
          <legend class="mb-1.5 text-sm font-medium">Собеседуют</legend>
          <label v-for="person in pool?.people ?? []" :key="person.id" class="flex items-center gap-2 text-sm">
            <input v-model="form.interviewerIds" type="checkbox" :value="person.id" class="accent-accent size-4" >
            {{ person.name }}
          </label>
        </fieldset>
        <p class="text-ink-soft text-xs">Время — московское.</p>
        <UiNotice :ok="cut.result.value?.ok" :message="cut.result.value?.message" />
        <UiButton type="submit" :pending="cut.pending.value" :disabled="!form.date || !form.location || form.interviewerIds.length === 0">
          Создать слоты
        </UiButton>
      </form>
    </aside>
  </main>
</template>
