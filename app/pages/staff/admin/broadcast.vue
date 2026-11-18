<script setup lang="ts">
import { Megaphone } from "lucide-vue-next";

import { PARTICIPATION_INVITATION, QUESTIONS, questionKeys, type Questions } from "~~/lib/participation/form";
import { SEGMENTS, type Segment } from "~~/lib/admin/segments";

/**
 * Рассылки: кому, что и куда ведёт нажатие. До отправки видно, сколько
 * человек получат. Уходит в колокольчик, Telegram и пуши как «Важное».
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Рассылки" });

// Сегмент можно задать ссылкой, например из дашборда «Не записавшиеся»:
// /staff/admin/broadcast?segment=not_booked
const route = useRoute();
const rawSegment = Array.isArray(route.query.segment) ? route.query.segment[0] : route.query.segment;
const initialSegment = rawSegment && rawSegment in SEGMENTS ? (rawSegment as Segment) : "drafts";
const segment = ref<Segment>(initialSegment);
const title = ref("");
const body = ref("");
const url = ref("/cabinet");
const confirming = ref(false);
const questions = reactive<Questions>({ ...QUESTIONS });
const registration = computed(() => segment.value === "sha_participation");
const test = computed(() => segment.value === "sha_test");
const ready = computed(() => !!title.value.trim() && !!preview.value?.count
  && (!registration.value || questionKeys.every((key) => questions[key].trim())));

const { data: preview } = await useFetch<{ count: number }>("/api/admin/broadcast/preview", { query: { segment } });

const send = useAction("/api/admin/broadcast/send");
async function submit() {
  if (!ready.value) return;
  const result = await send.submit({
    segment: segment.value,
    title: title.value,
    body: body.value || null,
    url: registration.value || test.value ? null : url.value || null,
    ...(registration.value ? { questions } : {}),
  });
  confirming.value = false;
  if (result.ok) {
    title.value = "";
    body.value = "";
  }
}

watch(segment, (value) => {
  confirming.value = false;
  if (value === "sha_participation") {
    title.value = PARTICIPATION_INVITATION.title;
    body.value = PARTICIPATION_INVITATION.body;
  }
  if (value === "sha_test") {
    title.value = "Тест Школы Актива";
    body.value = "Привет! Открой тест Школы Актива по кнопке ниже.";
  }
}, { immediate: true });
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

    <form class="bg-card border-line flex flex-col gap-4 rounded-3xl border p-5" @submit.prevent="ready && (confirming = true)">
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
      <UiInput v-if="!registration && !test" v-model="url" label="Куда ведёт нажатие" placeholder="/cabinet" hint="Путь на сайте. В Telegram это кнопка «Открыть»." />

      <details v-if="registration" open class="border-line rounded-2xl border p-4">
        <summary class="cursor-pointer font-semibold">Вопросы анкеты участника</summary>
        <p class="text-ink-soft mt-2 text-sm">В Telegram к приглашению будет приложено заявление для несовершеннолетних. Изменения вопросов применятся к новым приглашениям.</p>
        <div class="mt-4 grid gap-3">
          <label v-for="(key, index) in questionKeys" :key="key" class="flex flex-col gap-1 text-sm">
            <span>{{ index + 1 }}. Формулировка вопроса</span>
            <textarea v-model="questions[key]" :disabled="confirming || send.pending.value" :rows="key === 'consent' ? 5 : 2" maxlength="1500" class="border-line bg-paper rounded-xl border p-3 text-base" />
          </label>
        </div>
      </details>
      <p v-if="test" class="text-ink-soft text-sm">В сообщении будет кнопка «Открыть», ведущая на тест Школы Актива.</p>
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
      <UiButton v-else type="submit" :disabled="!ready">
        <Megaphone class="size-5" aria-hidden="true" /> Разослать
      </UiButton>
    </form>
  </main>
</template>
