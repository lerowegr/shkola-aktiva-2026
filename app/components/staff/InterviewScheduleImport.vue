<script setup lang="ts">
import { parseInterviewTable } from "~~/lib/interviews/import-table";

const props = defineProps<{ people: { id: string; name: string }[] }>();
const emit = defineEmits<{ saved: [] }>();
const text = ref("");
const parsed = computed(() => parseInterviewTable(text.value, props.people));
const checkedText = ref<string | null>(null);
const action = useAction("/api/staff/interviews/import");
watch(text, () => { checkedText.value = null; action.result.value = null; }, { flush: "sync" });
async function submit(preview: boolean) {
  if (parsed.value.errors.length || !parsed.value.rows.length) return;
  const snapshot = text.value;
  const result = await action.submit({ rows: parsed.value.rows, preview });
  if (result.ok && snapshot === text.value) checkedText.value = preview ? snapshot : null;
  if (result.ok && !preview) { emit("saved"); text.value = ""; action.result.value = result; }
}
</script>

<template>
  <details class="bg-card border-line rounded-3xl border p-4">
    <summary class="text-accent min-h-9 cursor-pointer text-sm font-semibold">Добавить расписание из таблицы</summary>
    <div class="mt-3 flex min-w-0 flex-col gap-3">
      <p class="text-ink-soft text-sm">Скопируйте пять столбцов: дата (2026-11-02), с (08:30), до (10:00), корпус, имя мастера как в списке сайта. Каждый интервал разделится на собеседования по 45 минут.</p>
      <label class="flex flex-col gap-2 text-sm font-medium">Строки расписания
        <textarea v-model="text" :disabled="action.pending.value" rows="6" class="border-line bg-paper min-h-32 w-full min-w-0 rounded-xl border p-3 text-sm" placeholder="Вставьте строки из таблицы" />
      </label>
      <p class="text-ink-soft text-xs">Свободные слоты этих мастеров за указанные дни будут приведены к таблице. Записанные участники защищены: конфликт остановит сохранение целиком. Повтор не создаёт дубли.</p>
      <ul v-if="parsed.errors.length" class="text-danger flex flex-col gap-1 text-sm" role="alert"><li v-for="error in parsed.errors.slice(0, 10)" :key="error">{{ error }}</li><li v-if="parsed.errors.length > 10">Всего ошибок: {{ parsed.errors.length }}.</li></ul>
      <p v-if="parsed.rows.length" class="text-sm">Интервалов: {{ parsed.rows.length }}. Мастеров: {{ new Set(parsed.rows.map(r => r.interviewerId)).size }}.</p>
      <details v-if="parsed.rows.length" class="text-sm">
        <summary class="min-h-9 cursor-pointer">Посмотреть распознанное расписание</summary>
        <ul class="flex max-h-72 flex-col gap-2 overflow-auto py-2"><li v-for="(row, i) in parsed.rows" :key="i">{{ mskFormat(`${row.date}T12:00:00+03:00`, 'd MMM') }}, {{ row.from }}–{{ row.to }} · {{ row.location }} · {{ people.find(p => p.id === row.interviewerId)?.name }}</li></ul>
      </details>
      <UiNotice :ok="action.result.value?.ok" :message="action.result.value?.message" />
      <UiButton v-if="checkedText !== text || !text" :pending="action.pending.value" :disabled="!parsed.rows.length || !!parsed.errors.length" @click="submit(true)">Проверить расписание</UiButton>
      <UiButton v-else :pending="action.pending.value" @click="submit(false)">Сохранить расписание</UiButton>
    </div>
  </details>
</template>
