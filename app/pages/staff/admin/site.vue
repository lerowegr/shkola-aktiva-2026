<script setup lang="ts">
import { ExternalLink } from "lucide-vue-next";

import {
  hasContent,
  SECTION_KEYS,
  SECTION_LABELS,
  siteContentSchema,
  type SectionKey,
  type SiteContent,
} from "~~/lib/site/content";

/**
 * Тексты главной страницы. Разделы по одному, сохраняется всё сразу.
 * Пустой раздел на сайте не показывается — это нормально, пока текста нет.
 * Даты этапов здесь не правятся: они в «Этапах» и попадают на сайт сами.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Сайт" });

const { data } = await useFetch<{ content: SiteContent; defaults: SiteContent }>("/api/admin/site");

const form = reactive<SiteContent>(structuredClone(toRaw(data.value!.content)));
const saved = ref(JSON.stringify(form));
const dirty = computed(() => JSON.stringify(form) !== saved.value);

const section = ref<SectionKey>("hero");

const STEP_LABELS = {
  APPLICATION: "Анкета",
  HOMEWORK: "Домашнее задание",
  INTERVIEW: "Собеседование",
  RESULTS: "Итоги",
} as const;

// Проверяем той же схемой, что и сервер, — но говорим, где именно ошибка.
const problem = ref<string | null>(null);
function locate(path: PropertyKey[]): string {
  const [key, field, index] = path;
  const where = [SECTION_LABELS[key as SectionKey]];
  if (field === "items" || field === "points") where.push(`пункт ${Number(index) + 1}`);
  return where.join(", ");
}

const save = useAction<SiteContent>("/api/admin/site/save");
async function submit() {
  const parsed = siteContentSchema.safeParse(form);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    problem.value = `${locate(issue.path)}: ${issue.message}`;
    section.value = issue.path[0] as SectionKey;
    return;
  }
  problem.value = null;
  const result = await save.submit(parsed.data);
  if (result.ok) saved.value = JSON.stringify(form);
}

onBeforeRouteLeave(() => !dirty.value || window.confirm("Есть несохранённые изменения. Уйти без сохранения?"));

const card = () => ({ title: "", text: "" });
</script>

<template>
  <main class="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 pb-28">
    <StaffAdminNav />
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h1 class="font-display text-3xl">Сайт</h1>
        <p class="text-ink-soft max-w-2xl text-sm">
          Тексты главной страницы. Пустой раздел на сайте не показывается. Даты этапов берутся из
          <NuxtLink to="/staff/stages" class="text-accent hover:underline">«Этапов»</NuxtLink>.
        </p>
      </div>
      <a
        href="/"
        target="_blank"
        class="border-line bg-card hover:border-ink-soft inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
      >
        Открыть сайт <ExternalLink class="size-4" aria-hidden="true" />
      </a>
    </div>

    <div class="grid gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
      <nav class="flex gap-1 overflow-x-auto md:flex-col" aria-label="Разделы сайта">
        <button
          v-for="key in SECTION_KEYS"
          :key="key"
          type="button"
          class="flex min-h-10 shrink-0 items-center justify-between gap-2 rounded-xl px-3 text-left text-sm"
          :class="section === key ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'"
          :aria-current="section === key || undefined"
          @click="section = key"
        >
          {{ SECTION_LABELS[key] }}
          <span v-if="!hasContent(form, key)" class="text-xs opacity-70">пусто</span>
        </button>
      </nav>

      <section class="bg-card border-line flex min-w-0 flex-col gap-4 rounded-3xl border p-4 sm:p-5">
        <h2 class="font-display text-xl">{{ SECTION_LABELS[section] }}</h2>

        <template v-if="section === 'hero'">
          <UiTextarea
            v-model="form.hero.tagline"
            label="Подзаголовок"
            :max="160"
            hint="Под названием Школы. До 20 слов: что это и зачем подаваться."
          />
        </template>

        <template v-else-if="section === 'about'">
          <UiInput v-model="form.about.title" label="Заголовок" />
          <UiTextarea
            v-model="form.about.text"
            label="Текст"
            :rows="6"
            :max="900"
            hint="Проявляется по словам, пока читают. Два-три абзаца — уже много."
          />
          <p class="text-sm font-medium">Тезисы-наклейки</p>
          <AdminItems
            v-model="form.about.points"
            :max="4"
            add-label="Добавить тезис"
            :title="(item, index) => item || `Тезис ${index + 1}`"
            :create="() => ''"
          >
            <template #default="{ index }">
              <UiTextarea v-model="form.about.points[index]" label="Тезис" :rows="2" :max="140" />
            </template>
          </AdminItems>
        </template>

        <template v-else-if="section === 'selection'">
          <UiInput v-model="form.selection.title" label="Заголовок" />
          <UiTextarea v-model="form.selection.intro" label="Вступление" :rows="2" :max="300" />
          <UiTextarea
            v-for="(label, kind) in STEP_LABELS"
            :key="kind"
            v-model="form.selection.steps[kind]"
            :label="label"
            :rows="2"
            :max="300"
            hint="Что происходит на этом шаге. Даты подставятся сами."
          />
        </template>

        <template v-else-if="section === 'program' || section === 'roles'">
          <UiInput v-model="form[section].title" label="Заголовок раздела" />
          <AdminItems
            v-model="form[section].items"
            :max="8"
            :add-label="section === 'program' ? 'Добавить пункт программы' : 'Добавить роль'"
            :title="(item, index) => item.title || `Пункт ${index + 1}`"
            :create="card"
          >
            <template #default="{ item }">
              <UiInput v-model="item.title" label="Название" />
              <UiTextarea v-model="item.text" label="Описание" :rows="2" :max="240" />
            </template>
          </AdminItems>
        </template>

        <template v-else-if="section === 'history'">
          <UiInput v-model="form.history.title" label="Заголовок раздела" />
          <AdminItems
            v-model="form.history.items"
            :max="12"
            add-label="Добавить год"
            :title="(item, index) => item.year || `Пункт ${index + 1}`"
            :create="() => ({ year: '', title: '', text: '' })"
          >
            <template #default="{ item }">
              <div class="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
                <UiInput v-model="item.year" label="Год" inputmode="numeric" />
                <UiInput v-model="item.title" label="Заголовок" />
              </div>
              <UiTextarea v-model="item.text" label="Что было" :rows="2" :max="300" />
            </template>
          </AdminItems>
        </template>

        <template v-else-if="section === 'venue'">
          <UiInput v-model="form.venue.title" label="Заголовок" />
          <div class="grid gap-3 sm:grid-cols-2">
            <UiInput v-model="form.venue.place" label="Место" placeholder="Где проходит Школа" />
            <UiInput v-model="form.venue.dates" label="Даты" placeholder="Например, 10-14 июля" />
          </div>
          <UiTextarea v-model="form.venue.text" label="Подробности" :rows="3" :max="400" hint="Как добраться, что взять с собой." />
        </template>

        <template v-else-if="section === 'faq'">
          <UiInput v-model="form.faq.title" label="Заголовок раздела" />
          <AdminItems
            v-model="form.faq.items"
            :max="16"
            add-label="Добавить вопрос"
            :title="(item, index) => item.question || `Вопрос ${index + 1}`"
            :create="() => ({ question: '', answer: '' })"
          >
            <template #default="{ item }">
              <UiInput v-model="item.question" label="Вопрос" />
              <UiTextarea v-model="item.answer" label="Ответ" :rows="3" :max="800" />
            </template>
          </AdminItems>
        </template>

        <template v-else-if="section === 'contacts'">
          <UiInput v-model="form.contacts.telegram" label="Telegram-канал" placeholder="https://t.me/…" />
          <UiInput v-model="form.contacts.vk" label="ВКонтакте" placeholder="https://vk.com/…" />
          <UiInput v-model="form.contacts.email" label="Почта" type="email" inputmode="email" />
        </template>
      </section>
    </div>

    <div class="border-line bg-paper/95 fixed inset-x-0 bottom-0 z-20 border-t px-4 py-3 backdrop-blur">
      <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3">
        <p class="text-sm" :class="problem ? 'text-danger' : save.result.value?.ok && !dirty ? 'text-ok' : 'text-ink-soft'">
          {{ problem ?? (dirty ? "Есть несохранённые изменения." : (save.result.value?.message ?? "Всё сохранено.")) }}
        </p>
        <UiButton class="shrink-0 sm:w-auto" :pending="save.pending.value" :disabled="!dirty" @click="submit">
          Сохранить
        </UiButton>
      </div>
    </div>
  </main>
</template>
