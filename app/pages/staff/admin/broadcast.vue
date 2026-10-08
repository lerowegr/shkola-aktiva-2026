<script setup lang="ts">
import { Megaphone } from "lucide-vue-next";

import { SEGMENTS, type Segment } from "~~/lib/admin/segments";

/**
 * Рассылки: кому, что и куда ведёт нажатие. До отправки видно, сколько
 * человек получат. Уходит в колокольчик, Telegram и пуши как «Важное».
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Рассылки" });

const segment = ref<Segment>("drafts");
const title = ref("");
const body = ref("");
const url = ref("/cabinet");
const confirming = ref(false);

const { data: preview } = await useFetch<{ count: number }>("/api/admin/broadcast/preview", { query: { segment } });

const send = useAction("/api/admin/broadcast/send");
async function submit() {
  const result = await send.submit({ segment: segment.value, title: title.value, body: body.value || null, url: url.value || null });
  confirming.value = false;
  if (result.ok) {
    title.value = "";
    body.value = "";
  }
}

watch(segment, () => (confirming.value = false));
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
    <StaffAdminNav />
    <div class="flex flex-col gap-1">
      <h1 class="font-display text-3xl">Рассылки</h1>
      <p class="text-ink-soft text-sm">
        Уходит в колокольчик, в Telegram и в пуши — всем, кто не выключил «Важное». Ночью Telegram и пуши ждут утра.
      </p>
    </div>

    <form class="bg-card border-line flex flex-col gap-4 rounded-3xl border p-5" @submit.prevent="confirming = true">
      <div class="flex min-w-0 flex-col gap-1.5">
        <UiSelect v-model="segment" label="Кому">
          <option v-for="(label, key) in SEGMENTS" :key="key" :value="key">{{ label }}</option>
        </UiSelect>
        <span class="text-ink-soft text-xs">Получат: {{ preview?.count ?? "…" }}</span>
      </div>
      <UiInput v-model="title" label="Заголовок" placeholder="До дедлайна анкеты — сутки" />
      <label class="flex flex-col gap-1.5 text-sm font-medium">
        Текст — необязательно
        <textarea v-model="body" rows="4" maxlength="1500" class="border-line bg-paper rounded-2xl border px-4 py-3 text-base font-normal" />
      </label>
      <UiInput v-model="url" label="Куда ведёт нажатие" placeholder="/cabinet" hint="Путь на сайте. В Telegram это кнопка «Открыть»." />

      <UiNotice :ok="send.result.value?.ok" :message="send.result.value?.message" />

      <div v-if="confirming" class="bg-brand-yellow-soft flex flex-col gap-3 rounded-2xl p-4">
        <p class="text-sm">
          Отправить «{{ title }}» — {{ preview?.count ?? 0 }} получателям ({{ SEGMENTS[segment].toLowerCase() }})? Отменить
          рассылку после отправки нельзя.
        </p>
        <div class="flex gap-2 sm:w-80">
          <UiButton variant="ghost" @click="confirming = false">Ещё проверю</UiButton>
          <UiButton :pending="send.pending.value" @click="submit">Отправить</UiButton>
        </div>
      </div>
      <UiButton v-else type="submit" :disabled="!title.trim() || !preview?.count">
        <Megaphone class="size-5" aria-hidden="true" /> Разослать
      </UiButton>
    </form>
  </main>
</template>
