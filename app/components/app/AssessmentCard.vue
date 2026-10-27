<script setup lang="ts">
import { useIntervalFn, useNow } from "@vueuse/core";
import { CalendarClock, MapPin, UsersRound } from "lucide-vue-next";

import type { ActionResult } from "~/composables/useAction";
import type { CandidateAssessment, CandidateSlot } from "~~/lib/assessment/candidate";
import { ASSESSMENT_CHANGE_MS, placeLine } from "~~/lib/assessment/rules";

const props = defineProps<{ co: CandidateAssessment }>();
const emit = defineEmits<{ changed: [] }>();
const invite = computed(() => props.co.invite);
const day = computed(() => invite.value?.day ?? null);
const clock = useNow({ interval: 1000 });
const changing = ref(false);
const reserveMode = ref<boolean | null>(null);
const reserve = computed(() => reserveMode.value ?? invite.value?.reserveQueued ?? false);
const canChange = computed(() => Boolean(invite.value?.canChange && (!invite.value.changeClosesAt || clock.value.getTime() <= new Date(invite.value.changeClosesAt).getTime())));
const asking = computed(() => canChange.value && (!invite.value?.answer || changing.value || (invite.value?.reserveQueued && (invite.value.reserveSlots?.length ?? 0) > 0)));
const slots = computed(() => reserve.value ? invite.value?.reserveSlots ?? [] : invite.value?.slots ?? []);
const pending = ref<string | null>(null);
// Выбор — в два шага: нажал время (или отказ) → «Подтвердить». Случайное касание ничего не меняет.
const confirming = ref<{ answer: "GOING" | "RESERVE" | "CANT"; sessionId?: string; text: string } | null>(null);
function ask(value: "GOING" | "RESERVE" | "CANT", slot?: CandidateSlot) {
  result.value = null;
  confirming.value = {
    answer: value,
    sessionId: slot?.id,
    text: slot ? `Записаться на ${when(slot.startsAt)}?` : value === "RESERVE" ? "Встать в очередь резервного дня?" : "Отказаться от центра оценки?",
  };
}
const confirmBox = ref<HTMLElement | null>(null);
watch(confirming, async (value) => {
  if (!value) return;
  await nextTick();
  confirmBox.value?.scrollIntoView({ behavior: "smooth", block: "nearest" });
});
async function confirm() {
  const choice = confirming.value;
  if (!choice) return;
  await answer(choice.answer, choice.sessionId);
  confirming.value = null;
}
const result = ref<ActionResult | null>(null);
const closed = (slot: CandidateSlot) => slot.closed || !slot.startsAt || new Date(slot.startsAt).getTime() - clock.value.getTime() < ASSESSMENT_CHANGE_MS;
useIntervalFn(() => { if (!pending.value && !confirming.value) emit("changed"); }, 30_000);

async function answer(value: "GOING" | "RESERVE" | "CANT", sessionId?: string) {
  pending.value = sessionId ?? value;
  try {
    result.value = await $fetch<ActionResult>("/api/cabinet/assessment/answer", {
      method: "POST", body: { answer: value, ...(sessionId ? { sessionId } : {}) }, ignoreResponseError: true,
    }).catch(() => ({ ok: false, message: "Нет связи с сайтом. Проверьте интернет и попробуйте ещё раз." }));
    if (result.value.ok) {
      changing.value = false;
      reserveMode.value = value === "RESERVE";
      emit("changed");
    }
  } finally { pending.value = null; }
}
const when = (value: Date | string | null) => value ? `${mskDay(value)}, ${mskTime(value)} МСК` : "время уточним";
const button = "min-h-11 rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
</script>

<template>
  <section class="bg-brand-orange-soft border-ink/10 flex flex-col gap-4 rounded-3xl border p-5" aria-labelledby="co-title">
    <div class="flex items-start gap-4">
      <span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/60"><UsersRound class="size-6" aria-hidden="true" /></span>
      <div class="min-w-0 flex-1">
        <h2 id="co-title" class="font-display text-xl">{{ co.title }}</h2>
        <p class="text-ink/80 mt-1 text-sm whitespace-pre-line">{{ co.description ?? "Очный групповой этап: задания в команде вместе с другими кандидатами." }}</p>
      </div>
    </div>

    <p v-if="!invite" class="text-sm">Приглашение на день и факультет пришлём уведомлением. Время вы выберете сами.</p>
    <template v-else>
      <p class="text-sm">День приглашения: <b>{{ mskFormat(`${invite.invitedDay}T12:00:00Z`, "d MMMM") }}</b><template v-if="invite.faculty"> · {{ invite.faculty }}</template>.</p>

      <div v-if="invite.reserveQueued" class="bg-card/80 rounded-2xl p-4 text-sm" role="status">
        <p class="font-semibold">Вы в очереди на резервный день.</p>
        <p class="text-ink/80 mt-1">{{ invite.reserveSlots?.length ? "Выберите подходящее время резерва ниже — после выбора место будет закреплено за вами." : "Времена ещё не назначены. Ждите отдельного уведомления; пока приходить не нужно." }}</p>
      </div>
      <div v-else-if="invite.answer === 'CANT'" class="bg-card/80 rounded-2xl p-4 text-sm" role="status">Вы отказались от записи. Если планы поменялись, выберите доступное время.</div>

      <div v-if="asking" class="bg-card/80 flex flex-col gap-3 rounded-2xl p-4">
        <h3 class="font-semibold">{{ reserve ? "Выберите время резервного дня" : "Выберите время своего факультета" }}</h3>
        <p class="text-ink-soft text-xs">Место закрепится только после выбора. Перезапись и отказ — не позже чем за 2 часа до начала.</p>
        <div class="grid gap-2">
          <button v-for="slot in slots" :key="slot.id" type="button" :class="[button, slot.current ? 'border-accent bg-accent text-accent-ink' : 'border-ink/15 bg-card hover:border-accent']" :disabled="pending !== null || slot.full || closed(slot)" @click="ask('GOING', slot)">
            <span class="block">{{ when(slot.startsAt) }}</span>
            <span class="mt-1 block text-xs font-normal">{{ slot.building || slot.room ? placeLine(slot) : slot.title }}</span>
            <span class="mt-1 block text-xs">{{ slot.current ? 'Ваша запись' : closed(slot) ? 'Запись закрыта — до начала меньше 2 часов' : slot.full ? 'Все места заняты' : confirming?.sessionId === slot.id ? 'Выбрано — подтвердите ниже' : 'Выбрать это время' }}</span>
          </button>
        </div>
        <p v-if="!slots.length" class="text-ink-soft text-sm">{{ reserve ? "Времена резервного дня пока не созданы. Можно встать в очередь и ждать рассылки." : "Подходящих времён в этот день пока нет. Выберите резервный день или свяжитесь с организаторами." }}</p>
        <div v-if="confirming" ref="confirmBox" class="border-accent bg-card flex flex-col gap-2 rounded-2xl border-2 p-3" role="alertdialog" aria-label="Подтвердите выбор">
          <p class="text-sm font-semibold">{{ confirming.text }}</p>
          <div class="grid gap-2 sm:grid-cols-2">
            <button type="button" :class="[button, 'border-accent bg-accent text-accent-ink text-center']" :disabled="pending !== null" @click="confirm">Подтвердить</button>
            <button type="button" :class="[button, 'border-ink/15 bg-card text-center']" :disabled="pending !== null" @click="confirming = null">Отмена</button>
          </div>
        </div>
        <div class="grid gap-2">
          <button v-if="!reserve" type="button" :class="[button, 'border-ink/15 bg-card']" :disabled="pending !== null" @click="reserveMode = true">Посмотреть резервный день</button>
          <template v-else>
            <button type="button" :class="[button, 'border-ink/15 bg-card']" :disabled="pending !== null" @click="ask('RESERVE')">{{ invite.reserveQueued ? 'Остаться в очереди резерва' : 'Встать в очередь резервного дня' }}</button>
            <button type="button" class="min-h-11 text-left text-sm underline" @click="reserveMode = false">← Времена основного дня</button>
          </template>
          <button type="button" :class="[button, 'border-ink/15 bg-card']" :disabled="pending !== null" @click="ask('CANT')">Не получится — отказаться</button>
        </div>
        <button v-if="changing" type="button" class="min-h-11 self-start text-sm underline" @click="changing = false">Оставить запись как была</button>
      </div>

      <dl v-if="day && !asking" class="bg-card/80 grid gap-3 rounded-2xl p-4 text-sm sm:grid-cols-2">
        <div class="flex items-start gap-2"><MapPin class="mt-0.5 size-4 shrink-0" aria-hidden="true" /><div><dt class="text-ink-soft">Где</dt><dd class="font-semibold">{{ placeLine(day) }}</dd></div></div>
        <div class="flex items-start gap-2"><CalendarClock class="mt-0.5 size-4 shrink-0" aria-hidden="true" /><div><dt class="text-ink-soft">{{ day.reserve ? 'Резервный день — ваше время' : 'Ваше время' }}</dt><dd class="font-semibold">{{ when(day.startsAt) }}</dd></div></div>
        <p v-if="day.note" class="whitespace-pre-line sm:col-span-2">{{ day.note }}</p>
      </dl>
      <p v-if="day && invite.changeClosesAt" class="text-ink/80 text-xs">{{ canChange ? `Перезапись или отказ до ${when(invite.changeClosesAt)}.` : 'Самостоятельные изменения закрыты. Для переноса или отказа напишите организаторам в «Сообщениях».' }}</p>
      <button v-if="invite.answer && canChange && !asking" type="button" class="min-h-11 self-start text-sm underline" @click="changing = true; result = null">Поменять время или отказаться</button>
    </template>
    <UiNotice :ok="result?.ok" :message="result?.message" />
  </section>
</template>
