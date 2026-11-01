<script setup lang="ts">
const opened = ref(false);
const { data, refresh, status } = await useFetch('/api/staff/interviews/invitations', { immediate: false });
const invitation = computed(() => data.value?.invitation);
const send = useAction('/api/staff/interviews/invite');
async function open() { opened.value = !opened.value; if (opened.value) await refresh(); }
async function sendNow() { await send.submit({}); await refresh(); }

</script>
<template>
  <section class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-4">
    <button type="button" class="text-accent self-start text-sm font-semibold" :aria-expanded="opened" @click="open">Пригласить на собеседования</button>
    <div v-if="opened" class="flex flex-col gap-3">
      <p v-if="status === 'pending'" class="text-ink-soft text-sm">Проверяем адресатов…</p>
      <template v-if="invitation">
        <p class="text-sm">Готовы к приглашению: <strong>{{ invitation.count }}</strong>. Только прошедшие ЦО без записи и без предыдущего приглашения. Все факультеты.</p>
        <p v-if="invitation.state === 'upcoming'" class="text-ink-soft text-sm">{{ invitation.opensAt ? `Запись откроется ${mskFormat(invitation.opensAt, 'd MMMM, HH:mm')} МСК.` : 'Дата открытия пока не указана.' }}</p>
        <p v-if="!invitation.availableSlots" class="text-danger text-sm">Свободных будущих слотов пока нет. Участникам станет доступен выбор времени после заполнения расписания.</p>
        <p class="bg-paper rounded-2xl p-3 text-sm whitespace-pre-line">{{ invitation.text }}</p>
        <UiNotice :ok="send.result.value?.ok" :message="send.result.value?.message" />
        <UiButton :pending="send.pending.value" :disabled="!invitation.count" @click="sendNow">Отправить {{ invitation.count }} {{ plural(invitation.count, ["приглашение", "приглашения", "приглашений"]) }}</UiButton>
        <p class="text-ink-soft text-xs">Приглашения отправляются только по нажатию этой кнопки. Действие сохраняется в журнале.</p>
      </template>
      <p v-else-if="status !== 'pending'" class="text-ink-soft text-sm">Не удалось загрузить приглашение или этап не создан.</p>
    </div>
  </section>
</template>
