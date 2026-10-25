<script setup lang="ts">
import type { ActionResult } from "~/composables/useAction";

/**
 * Подгруппа сбора ЦО: название и эксперты. Её видят только организаторы и
 * эксперты — кандидату показывают сбор. Новая подгруппа сначала создаётся,
 * потом ей ставятся эксперты — два запроса, но одна кнопка.
 */
interface Group {
  id: string;
  title: string;
  experts: { id: string; name: string }[];
}

const props = defineProps<{ group: Group | null; sessionId: string; pool: { id: string; name: string }[]; suggestedTitle: string }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();

const form = reactive({
  title: props.group?.title ?? props.suggestedTitle,
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
      sessionId: props.sessionId,
      title: form.title,
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
</script>

<template>
  <form class="flex flex-col gap-4" @submit.prevent="save">
    <label class="flex flex-col gap-1.5 text-sm font-medium">
      Название подгруппы
      <input
        v-model="form.title"
        maxlength="80"
        placeholder="Подгруппа 1"
        class="border-line bg-paper focus:border-accent min-h-11 rounded-xl border px-3 text-base font-normal outline-none"
      >
    </label>

    <fieldset class="flex flex-col gap-2">
      <legend class="mb-1.5 text-sm font-medium">Эксперты — оценивают всех кандидатов подгруппы</legend>
      <p v-if="pool.length === 0" class="text-ink-soft text-sm">Мастеров отбора пока нет — их добавляют в «Админка → Люди».</p>
      <div class="grid gap-2 sm:grid-cols-2">
        <UiCheckbox v-for="person in pool" :key="person.id" v-model="form.experts" :value="person.id">{{ person.name }}</UiCheckbox>
      </div>
    </fieldset>

    <UiNotice :message="result && !result.ok ? result.message : null" />
    <div class="flex flex-col gap-2 sm:flex-row">
      <UiButton type="submit" :pending="pending">{{ group ? "Сохранить" : "Создать подгруппу" }}</UiButton>
      <UiButton variant="ghost" @click="emit('cancel')">Отмена</UiButton>
    </div>
  </form>
</template>
