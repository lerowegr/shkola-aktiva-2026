<script setup lang="ts">
import { CalendarCheck, MapPin } from "lucide-vue-next";

import type { CandidateInterview } from "~~/lib/interviews/booking";

/** Запись на собеседование: свободное время по дням, перенос и отмена. */
useHead({ title: "Собеседование" });

const { data, refresh } = await useFetch<{ interview: CandidateInterview | null }>("/api/cabinet/interview");
const iv = computed(() => data.value?.interview ?? null);
// Время записи прошло — человек уже был на собеседовании, ждёт итогов.
const past = computed(() => Boolean(iv.value?.booking && new Date(iv.value.booking.endsAt).getTime() < Date.now()));

const days = computed(() => {
  const groups: { key: string; day: Date | string; slots: CandidateInterview["slots"] }[] = [];
  for (const slot of iv.value?.slots ?? []) {
    const key = mskDayKey(slot.startsAt);
    const last = groups.at(-1);
    if (last?.key === key) last.slots.push(slot);
    else groups.push({ key, day: slot.startsAt, slots: [slot] });
  }
  return groups;
});

const bookAction = useAction("/api/cabinet/interview/book");
const cancelAction = useAction("/api/cabinet/interview/cancel");
const choosing = ref(false);
const confirmCancel = ref(false);

async function book(slotId: string) {
  const result = await bookAction.submit({ slotId });
  await refresh();
  if (result.ok) choosing.value = false;
}

async function cancel() {
  const result = await cancelAction.submit({});
  confirmCancel.value = false;
  if (result.ok) await refresh();
}

const showSlots = computed(() => iv.value && iv.value.allowed && !past.value && iv.value.state === "open" && (!iv.value.booking || choosing.value));
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div class="flex flex-col gap-1">
        <NuxtLink to="/cabinet" class="text-ink-soft hover:text-ink text-sm">← Кабинет</NuxtLink>
        <h1 class="font-display text-3xl">Собеседование</h1>
      </div>

      <p v-if="!iv" class="text-ink-soft">Этап собеседований ещё не заведён.</p>

      <template v-else>
        <div v-if="iv.final" class="rounded-3xl p-5" :class="iv.final === 'PASSED' ? 'bg-brand-green' : 'bg-card border-line border'">
          <p class="font-semibold">{{ iv.final === "PASSED" ? "Вы в Школе Актива! 🎉" : "Итоги отбора" }}</p>
          <p class="text-sm">
            {{
              iv.final === "PASSED"
                ? "Поздравляем — вы прошли отбор. Подробности о старте пришлём в ближайшие дни."
                : "Спасибо, что прошли весь отбор — анкету, центр оценки и собеседование 💛 В этот раз места в Школе Актива не хватило, и нам правда жаль 😔 Это не про то, что вы чего-то не умеете: мест мало, а сильных ребят много. Будем очень рады видеть вас в следующем наборе!"
            }}
          </p>
        </div>

        <div v-else-if="!iv.allowed" class="bg-card border-line rounded-3xl border p-5">
          <p class="font-semibold">Сначала — анкета</p>
          <p class="text-ink-soft text-sm">Запись на собеседование откроется, когда вы отправите анкету с домашним заданием.</p>
        </div>

        <div v-else-if="past" class="bg-brand-green-soft rounded-3xl p-5">
          <p class="font-semibold">Вы уже были на собеседовании ✨</p>
          <p class="text-ink-soft text-sm">Спасибо! Ждите итогов отбора — они придут сюда и в Telegram.</p>
        </div>

        <template v-else>
          <section v-if="iv.booking" class="bg-ink text-paper flex flex-col gap-3 rounded-3xl p-5">
            <p class="flex items-center gap-2 font-semibold">
              <CalendarCheck class="size-5" aria-hidden="true" />
              <span class="first-letter:uppercase">{{ mskDay(iv.booking.startsAt) }}, {{ mskTime(iv.booking.startsAt) }}–{{ mskTime(iv.booking.endsAt) }}</span>
            </p>
            <p class="text-paper/80 flex items-center gap-2 text-sm"><MapPin class="size-4" aria-hidden="true" /> {{ iv.booking.location }}</p>
            <p class="text-paper/60 text-xs">Напомним за сутки и за час — здесь и в Telegram. Время московское.</p>

            <div v-if="iv.booking.canChange && !iv.final" class="flex flex-wrap gap-2">
              <button type="button" class="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20" @click="choosing = !choosing">
                {{ choosing ? "Оставить как есть" : "Перенести" }}
              </button>
              <button
                v-if="!confirmCancel"
                type="button"
                class="text-paper/70 hover:text-paper rounded-xl px-4 py-2 text-sm"
                @click="confirmCancel = true"
              >
                Отменить запись
              </button>
              <template v-else>
                <span class="self-center text-sm">Точно отменить?</span>
                <button type="button" class="bg-brand-red rounded-xl px-4 py-2 text-sm font-semibold" @click="cancel">Да, отменить</button>
                <button type="button" class="text-paper/70 rounded-xl px-4 py-2 text-sm" @click="confirmCancel = false">Нет</button>
              </template>
            </div>
            <p v-else-if="!iv.final" class="text-paper/60 text-xs">До собеседования меньше 12 часов — перенести можно только через организаторов.</p>
          </section>

          <UiNotice v-if="cancelAction.result.value" :ok="cancelAction.result.value.ok" :message="cancelAction.result.value.message" />
          <UiNotice v-if="bookAction.result.value" :ok="bookAction.result.value.ok" :message="bookAction.result.value.message" />

          <p v-if="iv.state === 'upcoming'" class="bg-card border-line rounded-3xl border p-5 text-sm">
            Запись на собеседования откроется совсем скоро — пришлём уведомление.
          </p>
          <p v-else-if="iv.state === 'closed' && !iv.booking" class="bg-brand-red-soft rounded-3xl p-5 text-sm">
            Запись на собеседования закрыта. Если вы не успели — напишите организаторам.
          </p>

          <section v-if="showSlots" class="flex flex-col gap-4">
            <h2 class="font-display text-lg">{{ iv.booking ? "Выберите другое время" : "Выберите время" }}</h2>
            <p v-if="days.length === 0" class="bg-card border-line text-ink-soft rounded-3xl border p-5 text-sm">
              Свободного времени сейчас нет. Организаторы добавят слоты — пришлём уведомление.
            </p>
            <div v-for="group in days" :key="group.key" class="flex flex-col gap-2">
              <h3 class="font-semibold first-letter:uppercase">{{ mskDay(group.day) }}</h3>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  v-for="slot in group.slots"
                  :key="slot.id"
                  type="button"
                  class="bg-card border-line hover:border-accent flex flex-col items-start rounded-2xl border px-3 py-2.5 text-left transition disabled:opacity-50"
                  :disabled="bookAction.pending.value"
                  @click="book(slot.id)"
                >
                  <span class="font-semibold">{{ mskTime(slot.startsAt) }}</span>
                  <span class="text-ink-soft w-full truncate text-xs">{{ slot.location }}</span>
                </button>
              </div>
            </div>
          </section>
        </template>
      </template>
    </main>
  </div>
</template>
