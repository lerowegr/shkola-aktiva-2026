<script setup lang="ts">
import { useNow } from "@vueuse/core";
import { CalendarCheck, MapPin } from "lucide-vue-next";
import type { CandidateInterview } from "~~/lib/interviews/booking";

useHead({ title: "Собеседование" });
const { data, refresh } = await useFetch<{ interview: CandidateInterview | null }>("/api/cabinet/interview");
const iv = computed(() => data.value?.interview ?? null);
const now = useNow({ interval: 1000 });
const canChangeNow = computed(() => Boolean(iv.value?.booking?.canChange && now.value.getTime() <= new Date(iv.value.booking.changeDeadline).getTime()));
const past = computed(() => Boolean(iv.value?.booking && new Date(iv.value.booking.endsAt).getTime() < now.value.getTime()));
const bookAction = useAction("/api/cabinet/interview/book");
const choosing = ref(false);
const campus = ref("");
const day = ref("");
const campuses = computed(() => [...new Set(iv.value?.slots.map(s => s.location) ?? [])]);
const days = computed(() => [...new Map((iv.value?.slots ?? []).filter(s => s.location === campus.value).map(s => [mskDayKey(s.startsAt), s.startsAt])).entries()]);
const slots = computed(() => (iv.value?.slots ?? []).filter(s => s.location === campus.value && mskDayKey(s.startsAt) === day.value));
watch(campus, () => { day.value = ""; });
watch(campuses, values => { if (campus.value && !values.includes(campus.value)) campus.value = ""; });
const showSlots = computed(() => iv.value?.allowed && !iv.value.final && !iv.value.bookingCancelled && !past.value && iv.value.state === "open" && (!iv.value.booking || (choosing.value && canChangeNow.value)));
async function book(slotId: string) {
  const result = await bookAction.submit({ slotId });
  await refresh();
  if (result.ok) choosing.value = false;
}
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
          <p class="font-semibold">{{ iv.final === "PASSED" ? "Вы в Школе Актива! 🎉" : iv.final === "RESERVE" ? "Вы в резерве Школы Актива" : "Итоги отбора" }}</p>
          <p class="text-sm">
            {{
              iv.final === "PASSED"
                ? "Поздравляем — вы прошли отбор. Подробности о старте пришлём в ближайшие дни."
                : iv.final === "RESERVE"
                  ? "Вы успешно прошли отбор и вошли в резерв. Пока место не освободилось, участие не подтверждено. Если мы сможем пригласить вас, сообщим в личном кабинете и уведомлением."
                  : "Спасибо, что прошли весь отбор — анкету, центр оценки и собеседование 💛 В этот раз места в Школе Актива не хватило, и нам правда жаль 😔 Это не про то, что вы чего-то не умеете: мест мало, а сильных ребят много. Будем очень рады видеть вас в следующем наборе!"
            }}
          </p>
        </div>

        <p v-else-if="!iv.allowed && !iv.booking" class="bg-card border-line rounded-3xl border p-5">{{ iv.eligibilityMessage }}</p>
        <template v-else>
          <p v-if="!iv.allowed" role="status" class="bg-card border-line rounded-3xl border p-5 text-sm">{{ iv.eligibilityMessage }}</p>
          <section v-if="iv.booking" class="bg-ink text-paper flex flex-col gap-3 rounded-3xl p-5">
            <p class="flex items-center gap-2 font-semibold"><CalendarCheck class="size-5 shrink-0" aria-hidden="true" /><span>{{ mskDay(iv.booking.startsAt) }}, {{ mskTime(iv.booking.startsAt) }}–{{ mskTime(iv.booking.endsAt) }}</span></p>
            <p class="flex items-start gap-2 text-sm"><MapPin class="size-4 shrink-0" aria-hidden="true" />{{ iv.booking.location }}</p>
            <p class="text-sm">{{ iv.booking.room ? `Аудитория ${iv.booking.room}` : 'Аудиторию и подробности мастер напишет в личные сообщения за 5 минут до встречи.' }}</p>
            <p v-if="past" class="text-paper/80 text-sm">Время собеседования прошло. Информацию об итогах опубликуем в кабинете.</p>
            <template v-else>
              <p class="text-paper/80 text-sm">Перезаписаться можно 1 раз. Осталось перезаписей: {{ Math.max(0, 1 - iv.reschedulesUsed) }} из 1.</p>
              <p class="text-paper/80 text-sm">Срок перезаписи — до {{ mskFormat(iv.booking.changeDeadline, 'd MMMM, HH:mm') }} по Москве.</p>
              <p class="text-paper/70 text-xs">{{ iv.reschedulesUsed >= 1 ? 'Единственная перезапись уже использована. Для изменений обратитесь к организаторам.' : canChangeNow ? 'В 16:00 накануне напомним о сроке перезаписи.' : 'Самостоятельный перенос недоступен. Для изменений обратитесь к организаторам.' }}</p>
              <button type="button" :disabled="!canChangeNow" class="self-start rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-50" @click="choosing = !choosing">{{ choosing ? 'Оставить как есть' : 'Перезаписаться (1 раз)' }}</button>
            </template>
          </section>
          <p v-if="iv.bookingCancelled" class="bg-card border-line rounded-3xl border p-5 text-sm">Ваша запись отменена. Для новой записи свяжитесь с организаторами.</p>
          <UiNotice v-if="bookAction.result.value" :ok="bookAction.result.value.ok" :message="bookAction.result.value.message" />
          <p v-if="iv.state === 'upcoming'" class="bg-card border-line rounded-3xl border p-5 text-sm">Запись на собеседования откроется скоро — пришлём уведомление.</p>
          <p v-else-if="iv.state === 'closed' && !iv.booking" class="bg-card border-line rounded-3xl border p-5 text-sm">Запись закрыта. Если не успели записаться, обратитесь к организаторам.</p>
          <section v-if="showSlots" class="flex flex-col gap-4">
            <h2 class="font-display text-xl">{{ iv.booking ? 'Перезапись на собеседование' : 'Запись на собеседование' }}</h2>
            <p class="text-ink-soft text-sm">Выберите удобный корпус, затем день и время. Время московское. Записаться можно один раз и один раз самостоятельно перенести запись до 18:00 предыдущего дня.</p>
            <p class="text-ink-soft text-sm">На 2 ноября запись заканчивается 2 ноября в 02:00 ночи. На остальные дни — в 20:00 накануне. Все сроки — по Москве.</p>
            <p v-if="!campuses.length" class="bg-card border-line rounded-3xl border p-5 text-sm">Свободного времени сейчас нет. Организаторы добавят слоты — проверьте позже.</p>
            <label v-else class="flex flex-col gap-2 text-sm font-medium">1. Корпус
              <UiSelect v-model="campus" aria-label="Корпус"><option value="">Выберите корпус</option><option v-for="place in campuses" :key="place" :value="place">{{ place }}</option></UiSelect>
            </label>
            <label v-if="campus" class="flex flex-col gap-2 text-sm font-medium">2. День
              <UiSelect v-model="day" aria-label="День собеседования"><option value="">Выберите день</option><option v-for="[key, date] in days" :key="key" :value="key">{{ mskDay(date) }}</option></UiSelect>
            </label>
            <div v-if="day" class="flex flex-col gap-2">
              <h3 class="text-sm font-medium">3. Время</h3>
              <div class="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <button v-for="slot in slots" :key="slot.id" type="button" class="bg-card border-line hover:border-accent rounded-2xl border p-3 text-left disabled:opacity-50" :disabled="bookAction.pending.value" @click="book(slot.id)">
                  <span class="block font-semibold">{{ mskTime(slot.startsAt) }}–{{ mskTime(slot.endsAt) }}</span><span class="text-ink-soft text-xs">{{ slot.room ? `Аудитория ${slot.room}` : 'Аудитория уточняется' }}</span>
                </button>
              </div>
              <p v-if="!slots.length" class="text-ink-soft text-sm">Время уже заняли. Выберите другой день или корпус.</p>
            </div>
          </section>
        </template>
      </template>
    </main>
  </div>
</template>
