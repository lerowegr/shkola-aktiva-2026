<script setup lang="ts">
import { PARTICIPATION_SUCCESS, type Questions } from "~~/lib/participation/form";

useHead({ title: "Анкета участника" });
const { public: config } = useRuntimeConfig();
const { data, refresh, status } = await useFetch("/api/cabinet/participation");
const form = computed(() => data.value?.form);
const submit = useAction("/api/cabinet/participation/submit");
const done = ref(false);
const step = ref<"attendance" | "details">("attendance");
const consent = ref(false);
const minor = ref("");
const dietKind = ref("");
const fields = reactive({
  passportName: form.value?.name ?? "",
  passportNumber: "",
  passportDate: "",
  passportIssuer: "",
  citizenship: "",
  studentId: form.value?.studentId ?? "",
  diet: "",
  conditions: "",
  medication: "",
  healthNotes: "",
});

const passportFields = ["passportName", "passportNumber", "passportDate", "passportIssuer", "citizenship", "studentId"] satisfies (keyof Questions)[];
const healthFields = ["conditions", "medication", "healthNotes"] satisfies (keyof Questions)[];
const botLink = config.telegramBotUsername ? `https://t.me/${config.telegramBotUsername}?start=parent_consent` : "";
const detailsReady = computed(() => minor.value !== "" && dietKind.value !== "" &&
  (dietKind.value !== "other" || !!fields.diet.trim()) && (minor.value !== "yes" || form.value?.scanReceived));

async function send(attending: boolean) {
  if (!consent.value || submit.pending.value) return;
  const result = await submit.submit(attending ? {
    ...fields,
    consent: true,
    attending: true,
    minor: minor.value === "yes",
    diet: dietKind.value === "none" ? "Нет" : fields.diet,
  } : { consent: true, attending: false });
  if (result.ok) done.value = true;
}
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8">
      <NuxtLink to="/cabinet" class="text-accent text-sm font-semibold">← В личный кабинет</NuxtLink>
      <h1 class="font-display text-3xl">Анкета участника</h1>
      <p v-if="done || form?.submitted" role="status" class="bg-brand-green-soft text-ok rounded-2xl p-4 font-semibold">{{ PARTICIPATION_SUCCESS }}</p>
      <p v-else-if="status === 'error'" class="text-danger" role="alert">Не удалось открыть анкету. Обнови страницу и попробуй снова.</p>
      <p v-else-if="!form" class="text-ink-soft">Анкета откроется после приглашения организаторов.</p>
      <template v-else>
        <div class="border-line bg-card rounded-2xl border p-4">
          <p class="font-semibold">{{ form.name }}</p>
          <p v-if="form.faculty" class="text-ink-soft text-sm">{{ form.faculty }}</p>
        </div>
        <div v-if="step === 'attendance'" class="border-line bg-card grid gap-5 rounded-2xl border p-5">
          <label class="flex items-start gap-3">
            <input v-model="consent" type="checkbox" class="accent-accent mt-1.5 size-5 shrink-0">
            <span>{{ form.questions.consent }} <strong>Да</strong></span>
          </label>
          <fieldset class="grid gap-3" :disabled="!consent">
            <legend class="mb-3 font-medium">{{ form.questions.attending }}</legend>
            <div class="grid gap-2 sm:grid-cols-2">
              <UiButton :disabled="!consent || submit.pending.value" @click="step = 'details'">Да, смогу</UiButton>
              <UiButton variant="ghost" :disabled="!consent" :pending="submit.pending.value" @click="send(false)">Нет, отправить ответ</UiButton>
            </div>
          </fieldset>
        </div>
        <form v-else class="border-line bg-card grid min-w-0 gap-5 rounded-2xl border p-5" @submit.prevent="send(true)">
          <button type="button" class="text-accent w-fit text-sm font-semibold" @click="step = 'attendance'">← К вопросу об участии</button>
          <p class="text-ink-soft text-sm">Паспортные данные нужны для расселения по номерам.</p>
          <label v-for="key in passportFields" :key="key" class="grid gap-1 text-sm font-medium">
            {{ form.questions[key] }}
            <input v-model="fields[key]" type="text" required maxlength="500" class="border-line bg-paper min-h-12 rounded-xl border px-3 text-base" :autocomplete="key === 'passportName' ? 'name' : 'off'">
          </label>
          <label class="grid gap-1 text-sm font-medium">
            {{ form.questions.diet }}
            <select v-model="dietKind" required class="border-line bg-paper min-h-12 rounded-xl border px-3 text-base">
              <option disabled value="">Выбери ответ</option>
              <option value="none">Нет</option>
              <option value="other">Другое</option>
            </select>
          </label>
          <UiInput v-if="dietKind === 'other'" v-model="fields.diet" label="Укажи особенности питания" />
          <label v-for="key in healthFields" :key="key" class="grid gap-1 text-sm font-medium">
            {{ form.questions[key] }}
            <textarea v-model="fields[key]" rows="3" maxlength="2000" class="border-line bg-paper rounded-xl border p-3 text-base" />
          </label>
          <label class="grid gap-1 text-sm font-medium">
            {{ form.questions.minor }}
            <select v-model="minor" required class="border-line bg-paper min-h-12 rounded-xl border px-3 text-base">
              <option disabled value="">Выбери ответ</option>
              <option value="yes">Да</option>
              <option value="no">Нет</option>
            </select>
          </label>
          <div v-if="minor === 'yes'" class="bg-paper grid gap-3 rounded-xl p-4">
            <p class="text-sm">{{ form.questions.scan }}</p>
            <a href="/participation/parent-consent.docx" download="Заявление для несовершеннолетних.docx" class="text-accent text-sm font-semibold hover:underline">Скачать заявление</a>
            <a v-if="botLink" :href="botLink" target="_blank" rel="noopener" class="text-accent text-sm font-semibold hover:underline">Открыть бота в Telegram</a>
            <p class="text-ink-soft text-sm">При отправке файла добавь подпись «заявление».</p>
            <p v-if="form.scanReceived" role="status" class="text-ok text-sm font-semibold">Заявление получено</p>
            <UiButton v-else variant="ghost" :pending="status === 'pending'" @click="refresh()">Проверить, получен ли файл</UiButton>
          </div>
          <UiButton type="submit" :disabled="!detailsReady" :pending="submit.pending.value">Отправить анкету</UiButton>
        </form>
        <UiNotice :ok="submit.result.value?.ok" :message="submit.result.value?.message" />
      </template>
    </main>
  </div>
</template>
