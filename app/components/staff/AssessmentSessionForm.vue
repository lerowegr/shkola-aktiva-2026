<script setup lang="ts">
import type { ActionResult } from "~/composables/useAction";
import { FACULTIES } from "~~/lib/profile/onboarding";

/**
 * Сбор центра оценки: где и когда собираются все (корпус, общая аудитория),
 * каких факультетов приглашаем. Резервный день — один на сезон, для всех:
 * туда попадают ответившие «приду в резервный день».
 */
interface Session {
  id: string;
  title: string;
  building: string | null;
  room: string | null;
  startsAt: Date | string;
  note: string | null;
  faculties: string[];
  reserve: boolean;
  capacity: number;
}

const props = defineProps<{ session: Session | null; hasReserve: boolean }>();
const emit = defineEmits<{ saved: [id: string]; cancel: [] }>();

const form = reactive({
  title: props.session?.title ?? "",
  building: props.session?.building ?? "",
  room: props.session?.room ?? "",
  startsAt: mskInputValue(props.session ? new Date(props.session.startsAt).toISOString() : null),
  note: props.session?.note ?? "",
  faculties: [...(props.session?.faculties ?? [])],
  reserve: props.session?.reserve ?? false,
  capacity: props.session?.capacity ?? 50,
});
watch(() => form.startsAt, (value) => { if (value.slice(5, 10) === "10-31") form.reserve = true; });

const pending = ref(false);
const result = ref<ActionResult | null>(null);

async function save() {
  if (!form.startsAt) return (result.value = { ok: false, message: "Укажите дату и время сбора." });
  pending.value = true;
  try {
    const saved = await $fetch<ActionResult>("/api/staff/assessment/session", {
      method: "POST",
      body: {
        ...(props.session ? { id: props.session.id } : {}),
        title: form.title,
        building: form.building,
        room: form.room,
        startsAt: mskFromInput(form.startsAt),
        note: form.note,
        faculties: form.faculties,
        reserve: form.reserve,
        capacity: form.capacity,
      },
      ignoreResponseError: true,
    }).catch((): ActionResult => ({ ok: false, message: "Нет связи с сайтом. Проверьте интернет." }));
    if (!saved.ok) return (result.value = saved);
    result.value = null;
    emit("saved", saved.id as string);
  } finally {
    pending.value = false;
  }
}

const field = "border-line bg-paper focus:border-accent min-h-11 rounded-xl border px-3 text-base font-normal outline-none";
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="save">
    <label class="flex flex-col gap-1.5 text-sm font-medium">
      Название
      <input v-model="form.title" maxlength="80" :class="field" :placeholder="form.reserve ? 'Резервный день' : 'Понедельник: СНиМК и МЭО'" >
    </label>
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="flex flex-col gap-1.5 text-sm font-medium">
        Корпус
        <input v-model="form.building" maxlength="120" :class="field" placeholder="Например, 2 или «Главный»" >
      </label>
      <label class="flex flex-col gap-1.5 text-sm font-medium">
        Общая аудитория
        <input v-model="form.room" maxlength="120" :class="field" placeholder="Например, лекционная 305" >
      </label>
    </div>
    <UiDateTime v-model="form.startsAt" label="Начало — по Москве" size="md" />
    <label class="flex flex-col gap-1.5 text-sm font-medium">
      Лимит записей на это время
      <input v-model.number="form.capacity" type="number" min="1" max="10000" step="1" required :class="field" >
      <span class="text-ink-soft text-xs font-normal">
        Учитываются только выбравшие это время. Приглашение на день и очередь резерва место не занимают. Для объединённого слота лимит общий на все его факультеты.
      </span>
    </label>
    <label class="flex flex-col gap-1.5 text-sm font-medium">
      Заметка для кандидатов — необязательно
      <textarea
        v-model="form.note"
        rows="2"
        maxlength="500"
        placeholder="Например: вход со двора, возьмите студенческий"
        class="border-line bg-paper focus:border-accent rounded-xl border px-3 py-2.5 text-base font-normal outline-none"
      />
    </label>

    <fieldset class="bg-paper flex flex-col gap-3 rounded-2xl p-3">
      <UiCheckbox v-model="form.reserve">Это время резервного дня (31 октября)</UiCheckbox>
      <p v-if="form.reserve" class="text-ink-soft -mt-1 text-xs">
        В один резервный день можно создать несколько времён. Кандидаты сами выбирают время; при необходимости отправьте предложение из очереди.
      </p>
      <div class="flex flex-col gap-1.5">
        <p class="text-sm font-medium">Каких факультетов приглашаем</p>
        <p class="text-ink-soft -mt-1 text-xs">Факультет кандидат указал при регистрации. Это только выбор, кого пригласить, — оценка общая.</p>
        <p v-if="form.reserve" class="text-ink-soft text-xs">Не отмечайте факультеты, если это общее время резерва для всех.</p>
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <UiCheckbox v-for="faculty in FACULTIES" :key="faculty" v-model="form.faculties" :value="faculty">{{ faculty }}</UiCheckbox>
        </div>
      </div>
    </fieldset>

    <p v-if="session" class="text-ink-soft text-xs">
      Приглашённые видят место и время из приглашения. Поменяли — нажмите «Сообщить об изменении» у сбора.
    </p>
    <UiNotice :message="result && !result.ok ? result.message : null" />
    <div class="flex flex-col gap-2 sm:flex-row">
      <UiButton type="submit" :pending="pending">{{ session ? "Сохранить" : "Создать сбор" }}</UiButton>
      <UiButton variant="ghost" @click="emit('cancel')">Отмена</UiButton>
    </div>
  </form>
</template>
