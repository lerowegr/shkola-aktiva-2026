<script setup lang="ts">
const opened = ref(false);
interface Preview { people: { applicationId: string; name: string; faculty: string | null }[]; scheduled: { sendAt: string; status: string; count: number; sent: number } | null }
const { data, refresh } = useFetch<Preview>("/api/staff/interviews/reserve-invitations", { immediate: false });
const send = useAction("/api/staff/interviews/reserve-invitations");
const today = new Date(Date.now() + 3 * 60 * 60_000).toISOString().slice(0, 10);
const sendAt = ref(`${today}T08:00`);
async function open() { opened.value = !opened.value; if (opened.value) await refresh(); }
async function schedule() { await send.submit({ sendAt: mskFromInput(sendAt.value) }); await refresh(); }
</script>
<template>
  <section class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-4">
    <button type="button" class="text-accent self-start text-sm font-semibold" :aria-expanded="opened" @click="open">Пригласить новых участников резерва в 08:00</button>
    <div v-if="opened" class="flex flex-col gap-3">
      <p class="text-sm">Только участники резервных подгрупп с явкой, без записи и предыдущего приглашения.</p>
      <p v-if="data?.scheduled" class="text-sm" role="status">Рассылка: {{ mskFormat(data.scheduled.sendAt, 'd MMMM, HH:mm') }} МСК. Адресатов: {{ data.scheduled.count }}. {{ data.scheduled.status === 'DONE' ? `Завершена, приглашений создано: ${data.scheduled.sent}.` : 'Ожидает отправки.' }}</p>
      <p class="text-sm">Готовы к приглашению: {{ data?.people.length ?? 0 }}.</p>
      <ul class="flex max-h-60 flex-col gap-1 overflow-auto text-sm"><li v-for="person in data?.people ?? []" :key="person.applicationId">{{ person.name }} · {{ person.faculty }}</li></ul>
      <UiDateTime v-model="sendAt" label="Отправить, по Москве" />
      <p class="text-ink-soft text-xs">Приглашение предложит выбрать время на оставшуюся неделю. Перед отправкой запись и допуск проверятся повторно.</p>
      <UiNotice :ok="send.result.value?.ok" :message="send.result.value?.message" />
      <UiButton :pending="send.pending.value" :disabled="!data?.people.length || !!(data?.scheduled && data.scheduled.status !== 'DONE')" @click="schedule">Запланировать приглашения резерву</UiButton>
    </div>
  </section>
</template>
