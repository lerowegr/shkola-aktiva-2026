<script setup lang="ts">
import { PARENT_CONSENT, PARTICIPATION_SUCCESS, type Questions } from "~~/lib/participation/form";
import { mskDayKey } from "~/utils/moscow";

useHead({ title: "Анкета участника" });
const { public: config } = useRuntimeConfig();
const { data, refresh, status } = await useFetch("/api/cabinet/participation");
const form = computed(() => data.value?.form);
const submit = useAction("/api/cabinet/participation/submit");
const done = ref(false);
const step = ref<"attendance" | "details">("attendance");
const consent = ref(false);
const minor = ref("");
const dietKind = ref<"Да" | "Нет" | "Другое">();
const dietDetails = ref("");
const dietOptions = ["Да", "Нет", "Другое"] as const;
const today = mskDayKey(new Date());
const fields = reactive({
  passportName: form.value?.name ?? "",
  passportNumber: "",
  passportDate: "",
  passportIssuer: "",
  citizenship: "",
  studentId: form.value?.studentId ?? "",
  conditions: "",
  medication: "",
  healthNotes: "",
});

const passportFields = ["passportName", "passportNumber", "passportDate", "passportIssuer", "citizenship", "studentId"] satisfies (keyof Questions)[];
const healthFields = ["conditions", "medication", "healthNotes"] satisfies (keyof Questions)[];
const botLink = !config.demo && config.telegramBotUsername ? `https://t.me/${config.telegramBotUsername}?start=parent_consent` : "";
const detailsReady = computed(() => Boolean(fields.passportDate && minor.value && dietKind.value &&
  (dietKind.value !== "Другое" || dietDetails.value.trim()) && (minor.value !== "yes" || form.value?.scanReceived)));

function formatPassportInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const beforeCaret = input.value.slice(0, input.selectionStart ?? input.value.length).replace(/\D/g, "").length;
  const digits = input.value.replace(/\D/g, "").slice(0, 10);
  const formatted = digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;
  if (input.value !== formatted) {
    input.value = formatted;
    const position = Math.min(beforeCaret, digits.length);
    const caret = position > 4 ? position + 1 : position;
    input.setSelectionRange(caret, caret);
  }
  fields.passportNumber = formatted;
}

async function send(attending: boolean) {
  if (!consent.value || submit.pending.value || (attending && !detailsReady.value)) return;
  const result = await submit.submit(attending ? {
    ...fields,
    consent: true,
    attending: true,
    minor: minor.value === "yes",
    passportDate: fields.passportDate.split("-").reverse().join("."),
    diet: dietKind.value === "Другое" ? dietDetails.value.trim() : dietKind.value,
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
      <p v-if="config.demo" class="text-ink-soft text-sm">Демо-анкета. Для проверки используй вымышленные данные.</p>
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
          <template v-for="key in passportFields" :key="key">
            <UiDateTime
              v-if="key === 'passportDate'"
              v-model="fields.passportDate"
              :label="form.questions[key]"
              :max-date="today"
              mode="date"
              numeric-date
            />
            <label v-else class="grid gap-1 text-sm font-medium">
              {{ form.questions[key] }}
              <input
                v-if="key === 'passportNumber'"
                :value="fields.passportNumber"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                placeholder="4522 123456"
                pattern="[0-9]{4} [0-9]{6}"
                title="Введите четыре цифры серии и шесть цифр номера"
                required
                class="border-line bg-paper focus:border-accent focus:ring-accent/20 min-h-12 rounded-xl border px-3 text-base tabular-nums outline-none focus:ring-4"
                @input="formatPassportInput"
              >
              <input v-else v-model="fields[key]" type="text" required maxlength="500" class="border-line bg-paper min-h-12 rounded-xl border px-3 text-base" :autocomplete="key === 'passportName' ? 'name' : 'off'">
            </label>
          </template>
          <fieldset class="min-w-0">
            <legend class="mb-2 text-sm font-medium">{{ form.questions.diet }}</legend>
            <div class="grid grid-cols-3 gap-2">
              <label v-for="option in dietOptions" :key="option" class="cursor-pointer">
                <input v-model="dietKind" type="radio" name="participation-diet" :value="option" required class="peer sr-only">
                <span class="border-line bg-card hover:border-ink-soft peer-checked:border-accent peer-checked:bg-accent peer-checked:text-accent-ink peer-focus-visible:ring-accent/30 grid min-h-12 place-items-center rounded-2xl border px-2 text-sm font-semibold peer-focus-visible:ring-4">
                  {{ option }}
                </span>
              </label>
            </div>
          </fieldset>
          <label v-if="dietKind === 'Другое'" class="grid gap-1 text-sm font-medium">
            Укажи особенности питания
            <input v-model="dietDetails" type="text" maxlength="500" required class="border-line bg-paper focus:border-accent focus:ring-accent/20 min-h-12 rounded-xl border px-3 text-base outline-none focus:ring-4">
          </label>
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
            <a :href="PARENT_CONSENT.path" :download="PARENT_CONSENT.filename" class="text-accent text-sm font-semibold hover:underline">Скачать заявление</a>
            <a v-if="botLink" :href="botLink" target="_blank" rel="noopener" class="text-accent text-sm font-semibold hover:underline">Открыть бота в Telegram</a>
            <p v-if="config.demo" class="text-ink-soft text-sm">На демо можно скачать шаблон. Приём подписанного файла доступен через бота основной версии.</p>
            <p v-else class="text-ink-soft text-sm">При отправке файла добавь подпись «заявление».</p>
            <p v-if="form.scanReceived" role="status" class="text-ok text-sm font-semibold">Заявление получено</p>
            <UiButton v-else-if="!config.demo" variant="ghost" :pending="status === 'pending'" @click="refresh()">Проверить, получен ли файл</UiButton>
          </div>
          <UiButton type="submit" :disabled="!detailsReady" :pending="submit.pending.value">Отправить анкету</UiButton>
        </form>
        <UiNotice :ok="submit.result.value?.ok" :message="submit.result.value?.message" />
      </template>
    </main>
  </div>
</template>
