<script setup lang="ts">
import { CheckCircle2, FileText, Send, Upload } from "lucide-vue-next";

import type { HomeworkView } from "~~/lib/applications/homework";

/** Домашнее задание: текст, дедлайн, сдача PDF и история версий. */
useHead({ title: "Домашнее задание" });

const { data, refresh } = await useFetch<{ homework: HomeworkView | null }>("/api/cabinet/homework");
const hw = computed(() => data.value?.homework ?? null);
const current = computed(() => hw.value?.submissions.find((item) => item.current) ?? null);

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
      await refresh();
    }
  } catch {
    result.value = { ok: false, message: "Нет связи с сайтом. Проверьте интернет." };
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div class="flex flex-col gap-1">
        <NuxtLink to="/cabinet" class="text-ink-soft hover:text-ink text-sm">← Кабинет</NuxtLink>
        <h1 class="font-display text-3xl">Домашнее задание</h1>
      </div>

      <p v-if="!hw" class="text-ink-soft">Этап домашнего задания ещё не заведён.</p>

      <div v-else-if="hw.admission === null" class="bg-card border-line rounded-3xl border p-5">
        <p class="font-semibold">Результаты анкеты ещё не объявлены</p>
        <p class="text-ink-soft text-sm">Как только организаторы их опубликуют, здесь появится задание. Сообщим в колокольчик и в Telegram.</p>
      </div>

      <div v-else-if="hw.admission === 'REJECTED'" class="bg-card border-line rounded-3xl border p-5">
        <p class="font-semibold">В этот раз дальше пройти не получилось</p>
        <p class="text-ink-soft text-sm">Спасибо, что подали анкету. Приходите на следующий набор — будем рады!</p>
      </div>

      <template v-else>
        <section class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h2 class="font-semibold">Задание</h2>
            <span v-if="hw.closesAt" class="bg-brand-yellow-soft rounded-full px-3 py-1 text-xs font-semibold">
              Сдать до {{ day(hw.closesAt) }}
            </span>
          </div>
          <p v-if="hw.task" class="whitespace-pre-line">{{ hw.task }}</p>
          <p v-else class="text-ink-soft text-sm">Текст задания появится здесь, когда организаторы его опубликуют.</p>
        </section>

        <section v-if="current" class="bg-brand-green-soft flex items-start gap-3 rounded-3xl p-5">
          <CheckCircle2 class="text-ok size-6 shrink-0" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <p class="font-semibold">Сдано {{ day(current.submittedAt) }}</p>
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
            <p v-if="hw.canSubmit" class="text-ink-soft mt-1 text-sm">Можно пересдать до дедлайна — проверят новую версию.</p>
          </div>
        </section>

        <p v-if="hw.state === 'upcoming'" class="bg-card border-line rounded-3xl border p-5 text-sm">
          Приём работ откроется {{ hw.opensAt ? day(hw.opensAt) : "скоро" }}.
        </p>
        <p v-else-if="hw.state === 'closed' && !current" class="bg-brand-red-soft rounded-3xl p-5 text-sm">
          Приём работ закрыт — работа не была сдана.
        </p>

        <form v-if="hw.canSubmit" class="bg-card border-line flex flex-col gap-4 rounded-3xl border p-5" @submit.prevent="submit">
          <h2 class="font-semibold">{{ current ? "Сдать новую версию" : "Сдать работу" }}</h2>

          <label
            class="border-line hover:border-accent bg-paper flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition"
          >
            <component :is="file ? FileText : Upload" class="text-accent size-7" aria-hidden="true" />
            <span class="text-sm font-semibold">{{ file ? file.name : "Выбрать PDF" }}</span>
            <span class="text-ink-soft text-xs">{{ file ? kb(file.size) : "Только PDF, до 20 МБ" }}</span>
            <input ref="input" type="file" accept="application/pdf,.pdf" class="sr-only" @change="pick" >
          </label>

          <label class="flex flex-col gap-1.5 text-sm font-medium">
            Комментарий или ссылка — необязательно
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
            <Upload class="size-5" aria-hidden="true" /> Сдать
          </UiButton>
          <p class="text-ink-soft flex items-center gap-1.5 text-xs">
            <Send class="size-3.5" aria-hidden="true" /> Можно и так: пришлите PDF боту в Telegram.
          </p>
        </form>

        <details v-if="hw.submissions.length > 1" class="text-sm">
          <summary class="text-ink-soft cursor-pointer">Все версии: {{ hw.submissions.length }}</summary>
          <ul class="mt-2 flex flex-col gap-1">
            <li v-for="item in hw.submissions" :key="item.id" class="text-ink-soft">
              {{ day(item.submittedAt) }}<template v-if="item.file"> — {{ item.file.filename }}</template>
              <template v-if="item.current"> (текущая)</template>
            </li>
          </ul>
        </details>
      </template>
    </main>
  </div>
</template>
