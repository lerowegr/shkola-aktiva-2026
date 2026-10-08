<script setup lang="ts">
import type { ActionResult } from "~/composables/useAction";

/**
 * Группа центра оценки: название, где и когда, эксперты. Новая группа
 * сначала создаётся, потом ей ставятся эксперты — два запроса, но одна кнопка.
 */
interface Group {
  id: string;
  title: string;
  building: string | null;
  room: string | null;
  startsAt: Date | string | null;
  note: string | null;
  experts: { id: string; name: string }[];
}

const props = defineProps<{ group: Group | null; pool: { id: string; name: string }[]; suggestedTitle: string }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();

const form = reactive({
  title: props.group?.title ?? props.suggestedTitle,
  building: props.group?.building ?? "",
  room: props.group?.room ?? "",
  startsAt: mskInputValue(props.group?.startsAt ? new Date(props.group.startsAt).toISOString() : null),
  note: props.group?.note ?? "",
  experts: props.group?.experts.map((expert) => expert.id) ?? [],
});

const pending = ref(false);
const result = ref<ActionResult | null>(null);

async function post(url: string, body: Record<string, unknown>) {
  return $fetch<ActionResult>(url, { method: "POST", body, ignoreResponseError: true }).catch((): ActionResult => ({
    ok: false,
    message: "Нет связи с сайтом. Проверьте интернет.",
  }));
}

async function save() {
  pending.value = true;
  try {
    const saved = await post("/api/staff/assessment/group", {
      ...(props.group ? { id: props.group.id } : {}),
      title: form.title,
      building: form.building,
      room: form.room,
      startsAt: form.startsAt ? mskFromInput(form.startsAt) : null,
      note: form.note,
    });
    if (!saved.ok) return (result.value = saved);

    const id = props.group?.id ?? (saved.id as string);
    const before = [...(props.group?.experts.map((expert) => expert.id) ?? [])].sort().join();
    if (before !== [...form.experts].sort().join()) {
      const experts = await post("/api/staff/assessment/experts", { groupId: id, userIds: form.experts });
      if (!experts.ok) return (result.value = experts);
    }
    result.value = null;
    emit("saved");
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
      <input v-model="form.title" maxlength="80" :class="field" placeholder="Группа 1" >
    </label>
    <div class="grid gap-3 sm:grid-cols-2">
      <label class="flex flex-col gap-1.5 text-sm font-medium">
        Корпус
        <input v-model="form.building" maxlength="120" :class="field" placeholder="Например, 2 или «Главный»" >
      </label>
      <label class="flex flex-col gap-1.5 text-sm font-medium">
        Аудитория
        <input v-model="form.room" maxlength="120" :class="field" placeholder="Например, 305" >
      </label>
    </div>
    <label class="flex flex-col gap-1.5 text-sm font-medium">
      Начало — по Москве
      <input v-model="form.startsAt" type="datetime-local" :class="field" >
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

    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1.5 text-sm font-medium">Эксперты — оценивают всех кандидатов группы</legend>
      <p v-if="pool.length === 0" class="text-ink-soft text-sm">Мастеров отбора пока нет — их добавляют в «Админка → Люди».</p>
      <div class="grid gap-2 sm:grid-cols-2">
        <UiCheckbox v-for="person in pool" :key="person.id" v-model="form.experts" :value="person.id">{{ person.name }}</UiCheckbox>
      </div>
    </fieldset>

    <UiNotice :message="result && !result.ok ? result.message : null" />
    <div class="flex flex-col gap-2 sm:flex-row">
      <UiButton type="submit" :pending="pending">{{ group ? "Сохранить" : "Создать группу" }}</UiButton>
      <UiButton variant="ghost" @click="emit('cancel')">Отмена</UiButton>
    </div>
  </form>
</template>
