<script setup lang="ts">
import { CalendarClock, MapPin, UsersRound } from "lucide-vue-next";

import type { ActionResult } from "~/composables/useAction";
import type { CandidateAssessment } from "~~/lib/assessment/candidate";
import { placeLine } from "~~/lib/assessment/rules";

/**
 * Центр оценки в кабинете кандидата: что за этап и приглашение на сбор —
 * «буду», «приду в резервный день», «не получится». Ответ можно поменять,
 * пока день не начался. Только сбор: подгрупп и результатов здесь нет.
 */
const props = defineProps<{ co: CandidateAssessment }>();
const emit = defineEmits<{ changed: [] }>();

type Answer = "GOING" | "RESERVE" | "CANT";
const invite = computed(() => props.co.invite);
const day = computed(() => invite.value?.day ?? null);
// День прошёл — дальше ждём итогов, а не идём в аудиторию.
const over = computed(() => Boolean(day.value?.startsAt && new Date(day.value.startsAt).getTime() + 4 * 60 * 60 * 1000 < Date.now()));

const changing = ref(false);
const asking = computed(() => Boolean(invite.value && invite.value.canChange && (!invite.value.answer || changing.value)));

const pending = ref<Answer | null>(null);
const result = ref<ActionResult | null>(null);
async function answer(value: Answer) {
  pending.value = value;
  try {
    result.value = await $fetch<ActionResult>("/api/cabinet/assessment/answer", {
      method: "POST",
      body: { answer: value },
      ignoreResponseError: true,
    }).catch((): ActionResult => ({ ok: false, message: "Нет связи с сайтом. Проверьте интернет и попробуйте ещё раз." }));
    if (result.value.ok) {
      changing.value = false;
      emit("changed");
    }
  } finally {
    pending.value = null;
  }
}

const when = (value: Date | string | null) => (value ? `${mskDay(value)}, ${mskTime(value)}` : "время уточним");
const button = "min-h-11 rounded-2xl px-4 py-2.5 text-left text-sm font-semibold transition disabled:opacity-60";
</script>

<template>
  <section class="bg-brand-orange-soft border-ink/10 flex flex-col gap-4 rounded-3xl border p-5" aria-labelledby="co-title">
    <div class="flex items-start gap-4">
      <span class="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/60">
        <UsersRound class="size-6" aria-hidden="true" />
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h2 id="co-title" class="font-display text-xl">{{ co.title }}</h2>
        <p class="text-ink/80 text-sm whitespace-pre-line">
          {{ co.description ?? "Очный групповой этап: задания в команде вместе с другими кандидатами." }}
        </p>
      </div>
    </div>

    <p v-if="!invite" class="text-ink/70 text-sm">Приглашение с местом и временем пришлём уведомлением.</p>

    <p v-else-if="over" class="bg-card/80 rounded-2xl p-4 text-sm">
      Вы уже были на центре оценки ✨ Спасибо! Дальше — собеседование, а итоги отбора объявим в конце.
    </p>

    <!-- Вопрос: будете? -->
    <div v-else-if="asking" class="bg-card/80 flex flex-col gap-3 rounded-2xl p-4">
      <p class="text-sm">
        Приглашаем на центр оценки: <b>{{ when(invite.session.startsAt) }} МСК</b><template v-if="invite.session.building || invite.session.room">,
          {{ placeLine(invite.session) }}</template>. Будете?
      </p>
      <p v-if="invite.session.note" class="text-ink/80 text-sm whitespace-pre-line">{{ invite.session.note }}</p>
      <div class="grid gap-2">
        <button
          type="button"
          :class="[button, 'bg-accent text-accent-ink hover:brightness-110']"
          :disabled="pending !== null"
          @click="answer('GOING')"
        >
          Да, буду
        </button>
        <button
          v-if="invite.reserve"
          type="button"
          :class="[button, 'border-ink/15 bg-card hover:border-accent border']"
          :disabled="pending !== null"
          @click="answer('RESERVE')"
        >
          Нет, приду в резервный день — {{ when(invite.reserve.startsAt) }} МСК
        </button>
        <button
          type="button"
          :class="[button, 'border-ink/15 bg-card hover:border-accent border']"
          :disabled="pending !== null"
          @click="answer('CANT')"
        >
          Не получится ни в один из дней
        </button>
      </div>
      <button v-if="changing" type="button" class="text-ink/70 hover:text-ink self-start text-sm underline" @click="changing = false">
        Оставить как было
      </button>
    </div>

    <!-- Ответил «не смогу» -->
    <div v-else-if="invite.answer === 'CANT'" class="bg-card/80 flex flex-col gap-1 rounded-2xl p-4 text-sm">
      <p class="font-semibold">Вы ответили, что не сможете прийти.</p>
      <p class="text-ink/80">Организаторы с вами свяжутся. Если планы поменялись — поменяйте ответ.</p>
    </div>

    <!-- Свой день -->
    <dl v-else-if="day" class="bg-card/80 grid gap-3 rounded-2xl p-4 text-sm sm:grid-cols-2">
      <div v-if="day.building || day.room" class="flex items-start gap-2.5">
        <MapPin class="text-ink-soft mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <dt class="text-ink-soft">Где</dt>
          <dd class="font-semibold">{{ placeLine(day) }}</dd>
        </div>
      </div>
      <div class="flex items-start gap-2.5">
        <CalendarClock class="text-ink-soft mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div>
          <dt class="text-ink-soft">{{ day.reserve ? "Когда — резервный день" : "Когда" }}</dt>
          <dd class="font-semibold">{{ when(day.startsAt) }} <span class="text-ink-soft font-normal">МСК</span></dd>
        </div>
      </div>
      <p v-if="day.note" class="text-ink/80 whitespace-pre-line sm:col-span-2">{{ day.note }}</p>
    </dl>

    <UiNotice :ok="result?.ok" :message="result?.message" />

    <button
      v-if="invite && invite.answer && invite.canChange && !changing && !over"
      type="button"
      class="text-ink/70 hover:text-ink self-start text-sm underline"
      @click="(changing = true), (result = null)"
    >
      Поменять ответ
    </button>
  </section>
</template>
