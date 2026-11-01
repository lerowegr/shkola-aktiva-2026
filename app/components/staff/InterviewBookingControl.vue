<script setup lang="ts">
import type { ScheduleSlot } from "~~/lib/interviews/slots";
const props = defineProps<{ applicationId: string }>();
const emit = defineEmits<{ saved: [] }>();
const opened = ref(false);
const { data, refresh } = await useFetch<{ slots: ScheduleSlot[] }>("/api/staff/interviews", { immediate: false });
const current = computed(() => data.value?.slots.find(s => s.bookings.some(b => b.applicationId === props.applicationId)));
const targets = computed(() => (data.value?.slots ?? []).filter(s => new Date(s.startsAt).getTime() > Date.now() && s.capacity === 1 && s.interviewers.length === 1 && (!s.bookings.length || s.id === current.value?.id)));
const target = ref("");
const restore = ref(false);
const action = useAction("/api/staff/interviews/booking");
async function open() { opened.value = !opened.value; if (opened.value) { await refresh(); target.value = current.value?.id ?? ""; restore.value = false; } }
async function save() {
  const result = await action.submit({ applicationId: props.applicationId, slotId: target.value === '__cancel' ? null : target.value, restoreChange: target.value !== '__cancel' && restore.value });
  if (result.ok) { await refresh(); emit('saved'); }
}
</script>
<template>
  <section class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-4">
    <button type="button" class="text-accent self-start text-sm font-semibold" :aria-expanded="opened" @click="open">Управление записью на собеседование</button>
    <form v-if="opened" class="flex flex-col gap-3" @submit.prevent="save">
      <p class="text-ink-soft text-sm">{{ current ? `Текущая запись: ${mskFormat(current.startsAt, 'd MMM, HH:mm')}, ${current.location}` : 'Активной записи нет. Выберите время для кандидата.' }}</p>
      <label class="flex flex-col gap-1 text-sm">Время собеседования<UiSelect v-model="target" aria-label="Время собеседования"><option value="" disabled>Выберите время</option><option v-if="current" value="__cancel">Отменить запись</option><option v-for="slot in targets" :key="slot.id" :value="slot.id">{{ mskFormat(slot.startsAt, 'd MMM, HH:mm') }} · {{ slot.location }} · {{ slot.interviewers[0]?.name }}</option></UiSelect></label>
      <UiCheckbox v-model="restore" :disabled="!target || target === '__cancel'">Восстановить право на одну самостоятельную перезапись</UiCheckbox>
      <p class="text-ink-soft text-xs">Организатор может изменить запись вне дедлайна. Кандидат получит уведомление, действие сохранится в журнале.</p>
      <UiNotice :ok="action.result.value?.ok" :message="action.result.value?.message" />
      <UiButton type="submit" :pending="action.pending.value" :disabled="!target">Сохранить запись</UiButton>
    </form>
  </section>
</template>
