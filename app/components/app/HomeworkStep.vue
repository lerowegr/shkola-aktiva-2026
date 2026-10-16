<script setup lang="ts">
import { CheckCircle2, ChevronDown, FileText, Send, Upload } from "lucide-vue-next";

import type { HomeworkView } from "~~/lib/applications/homework";

/**
 * Домашнее задание внутри анкеты: текст задания, что уже прикреплено и
 * форма — PDF и/или ответ текстом. Пока анкета черновик, можно заменить;
 * после отправки — только посмотреть.
 */
const props = defineProps<{ hw: HomeworkView }>();
const emit = defineEmits<{ changed: [] }>();

const current = computed(() => props.hw.submissions.find((item) => item.current) ?? null);
const day = (value: Date | string | null) => (value ? mskFormat(value, "d MMMM, HH:mm") : "");
const kb = (size: number) => (size > 1024 * 1024 ? `${(size / 1024 / 1024).toFixed(1)} МБ` : `${Math.ceil(size / 1024)} КБ`);

const file = ref<File | null>(null);
const text = ref("");
const pending = ref(false);
const result = ref<{ ok: boolean; message: string } | null>(null);
const input = ref<HTMLInputElement | null>(null);

function pick(event: Event) {
  const chosen = (event.target as HTMLInputElement).files?.[0] ?? null;
  result.value = null;
  if (chosen && chosen.size > 20 * 1024 * 1024) {
    result.value = { ok: false, message: "Файл больше 20 МБ. Сожмите PDF или уберите лишние картинки." };
    file.value = null;
    return;
  }
  file.value = chosen;
}

async function submit() {
  pending.value = true;
  result.value = null;
  const form = new FormData();
  if (file.value) form.append("file", file.value);
  if (text.value.trim()) form.append("text", text.value);
  try {
    result.value = await $fetch<{ ok: boolean; message: string }>("/api/cabinet/homework", {
      method: "POST",
      body: form,
      ignoreResponseError: true,
    });
    if (result.value.ok) {
      file.value = null;
      text.value = "";
      if (input.value) input.value.value = "";
      emit("changed");
    }
  } catch {
    result.value = { ok: false, message: "Нет связи с сайтом. Проверьте интернет." };
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <section class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
      <h3 class="font-semibold">Задание</h3>
      <p v-if="hw.task" class="whitespace-pre-line">{{ hw.task }}</p>
      <p v-else class="text-ink-soft text-sm">Текст задания появится здесь, когда организаторы его опубликуют.</p>
    </section>

    <section v-if="current" class="bg-brand-green-soft flex items-start gap-3 rounded-3xl p-5">
      <CheckCircle2 class="text-ok size-6 shrink-0" aria-hidden="true" />
      <div class="min-w-0 flex-1">
        <p class="font-semibold">{{ hw.sent ? "Сдано вместе с анкетой" : "Прикреплено" }} {{ day(current.submittedAt) }}</p>
        <a
          v-if="current.file"
          :href="`/api/files/${current.file.id}`"
          target="_blank"
          rel="noopener"
          class="text-accent block truncate text-sm underline-offset-2 hover:underline"
        >
          {{ current.file.filename }} · {{ kb(current.file.size) }}
        </a>
        <p v-if="current.text" class="text-sm whitespace-pre-line">{{ current.text }}</p>
        <p v-if="hw.canSubmit" class="text-ink-soft mt-1 text-sm">До отправки анкеты можно заменить — уйдёт последняя версия.</p>
      </div>
    </section>

    <form v-if="hw.canSubmit" class="bg-card border-line flex flex-col gap-4 rounded-3xl border p-5" @submit.prevent="submit">
      <h3 class="font-semibold">{{ current ? "Заменить" : "Прикрепить работу" }}</h3>
      <label
        class="border-line hover:border-accent bg-paper flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition"
      >
        <component :is="file ? FileText : Upload" class="text-accent size-7" aria-hidden="true" />
        <span class="text-sm font-semibold">{{ file ? file.name : "Выбрать PDF" }}</span>
        <span class="text-ink-soft text-xs">{{ file ? kb(file.size) : "Только PDF, до 20 МБ" }}</span>
        <input ref="input" type="file" accept="application/pdf,.pdf" class="sr-only" @change="pick" >
      </label>
      <label class="flex flex-col gap-1.5 text-sm font-medium">
        Ответ текстом или ссылка — если без файла или в дополнение
        <textarea
          v-model="text"
          rows="3"
          maxlength="2000"
          placeholder="Например, ссылка на макет в Figma"
          class="border-line bg-paper rounded-2xl border px-4 py-3 text-base font-normal"
        />
      </label>
      <UiNotice v-if="result" :ok="result.ok" :message="result.message" />
      <UiButton type="submit" :pending="pending" :disabled="!file && !text.trim()">
        <Upload class="size-5" aria-hidden="true" /> {{ current ? "Заменить" : "Прикрепить" }}
      </UiButton>
      <p class="text-ink-soft flex items-center gap-1.5 text-xs">
        <Send class="size-3.5" aria-hidden="true" /> Можно и так: пришлите PDF боту в Telegram.
      </p>
    </form>

    <details v-if="hw.submissions.length > 1" class="group text-sm">
      <summary class="text-ink-soft flex cursor-pointer items-center gap-1.5">
        Все версии: {{ hw.submissions.length }}<ChevronDown class="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <ul class="mt-2 flex flex-col gap-1">
        <li v-for="item in hw.submissions" :key="item.id" class="text-ink-soft">
          {{ day(item.submittedAt) }}<template v-if="item.file"> — {{ item.file.filename }}</template>
          <template v-if="item.current"> (текущая)</template>
        </li>
      </ul>
    </details>
  </div>
</template>
