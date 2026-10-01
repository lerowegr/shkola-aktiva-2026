<script setup lang="ts">
import { KeyRound, Mail, Send } from "lucide-vue-next";

useHead({ title: "Вход" });

const route = useRoute();
const mode = ref<"candidate" | "staff">(route.query.as === "staff" ? "staff" : "candidate");

async function signedIn() {
  const user = await refreshSession();
  const from = typeof route.query.from === "string" && route.query.from.startsWith("/") ? route.query.from : null;
  await navigateTo(from ?? homeFor(user));
}

// Уже вошёл — нечего делать на странице входа.
const current = await useSession();
if (current.value) await navigateTo(homeFor(current.value), { replace: true });

const telegram = useTelegramLogin(signedIn);

// --- Почта: два шага, адрес → код ------------------------------------------
const email = ref("");
const code = ref("");
const codeSent = ref(false);
const request = useAction("/api/auth/email-request");
const verify = useAction("/api/auth/email-verify");

async function sendCode() {
  const result = await request.submit({ email: email.value });
  if (result.ok) codeSent.value = true;
}

async function checkCode() {
  const result = await verify.submit({ email: email.value, code: code.value });
  if (result.ok) await signedIn();
}

function changeEmail() {
  codeSent.value = false;
  code.value = "";
  request.result.value = null;
  verify.result.value = null;
}

// --- Тестовый вход: логин и пароль, только на превью --------------------------
const preview = useRuntimeConfig().public.previewLogins === true;
const previewLogin = ref("");
const previewPassword = ref("");
const previewAction = useAction("/api/auth/password-login");

async function signInPreview() {
  const result = await previewAction.submit({ email: previewLogin.value, password: previewPassword.value });
  if (result.ok) await signedIn();
}

// --- Пароль организатора -----------------------------------------------------
const staffEmail = ref("");
const password = ref("");
const passwordLogin = useAction("/api/auth/password-login");

async function signInWithPassword() {
  const result = await passwordLogin.submit({ email: staffEmail.value, password: password.value });
  if (result.ok) await signedIn();
}
</script>

<template>
  <main class="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-10">
    <NuxtLink to="/" class="flex items-center gap-2 self-start font-display text-sm">
      <span class="bg-lime grid size-9 place-items-center rounded-xl">ША</span>
      Школа Актива 2026
    </NuxtLink>

    <div class="flex flex-col gap-2">
      <h1 class="font-display text-3xl">Вход</h1>
      <p class="text-ink-soft">
        {{
          mode === "candidate"
            ? "Первый вход — это и есть регистрация на отбор."
            : "Для мастеров отбора и организаторов."
        }}
      </p>
    </div>

    <!-- Тестовый вход для показа сайта: виден, только пока включён на сервере. -->
    <form
      v-if="preview"
      class="border-brand-orange/60 bg-brand-orange-soft/40 flex flex-col gap-4 rounded-3xl border border-dashed p-4"
      @submit.prevent="signInPreview"
    >
      <div class="flex flex-col gap-1">
        <p class="font-semibold">Тестовый вход</p>
        <p class="text-ink-soft text-sm">Только на время проверки сайта: логин и пароль вместо почты и Telegram.</p>
      </div>
      <UiInput v-model="previewLogin" label="Логин" autocomplete="username" placeholder="admin или kandidat" />
      <UiInput v-model="previewPassword" label="Пароль" type="password" autocomplete="current-password" />
      <UiNotice :message="previewAction.result.value?.ok ? null : previewAction.result.value?.message" />
      <UiButton type="submit" :pending="previewAction.pending.value" :disabled="!previewLogin || !previewPassword">
        <KeyRound class="size-5" aria-hidden="true" />
        Войти
      </UiButton>
    </form>

    <div role="tablist" class="bg-line/60 grid grid-cols-2 gap-1 rounded-2xl p-1">
      <button
        v-for="tab in [
          { key: 'candidate', label: 'Участникам' },
          { key: 'staff', label: 'Организаторам' },
        ] as const"
        :key="tab.key"
        role="tab"
        type="button"
        :aria-selected="mode === tab.key"
        class="min-h-11 rounded-xl text-sm font-semibold transition"
        :class="mode === tab.key ? 'bg-card shadow-sm' : 'text-ink-soft hover:text-ink'"
        @click="mode = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <section class="flex flex-col gap-5">
      <!-- Telegram — у обоих: и у кандидатов, и у организаторов -->
      <div class="flex flex-col gap-2">
        <UiButton
          v-if="telegram.available && telegram.link.value"
          variant="telegram"
          :href="telegram.link.value"
          target="_blank"
          @click="telegram.started"
        >
          <Send class="size-5" aria-hidden="true" />
          Войти через Telegram
        </UiButton>
        <p v-if="telegram.waiting.value" class="text-ink-soft text-center text-sm" aria-live="polite">
          Подтвердите вход в боте — эта страница обновится сама.
        </p>
        <UiNotice :message="telegram.message.value" />
        <p v-if="!telegram.available" class="text-ink-soft text-sm">
          Вход через Telegram заработает, когда подключат бота.
        </p>
      </div>

      <div v-if="telegram.available" class="text-ink-soft flex items-center gap-3 text-sm" aria-hidden="true">
        <span class="bg-line h-px flex-1" />
        или
        <span class="bg-line h-px flex-1" />
      </div>

      <!-- Кандидат: код на почту -->
      <form v-if="mode === 'candidate' && !codeSent" class="flex flex-col gap-4" @submit.prevent="sendCode">
        <UiInput
          v-model="email"
          label="Почта"
          type="email"
          inputmode="email"
          autocomplete="email"
          placeholder="name@mail.ru"
        />
        <UiNotice :ok="request.result.value?.ok" :message="request.result.value?.ok ? null : request.result.value?.message" />
        <UiButton type="submit" variant="ghost" :pending="request.pending.value" :disabled="!email">
          <Mail class="size-5" aria-hidden="true" />
          Получить код на почту
        </UiButton>
      </form>

      <form v-else-if="mode === 'candidate'" class="flex flex-col gap-4" @submit.prevent="checkCode">
        <p class="text-sm">
          Отправили шестизначный код на <b>{{ email }}</b>. Письмо может попасть в «Спам».
          <button type="button" class="text-accent font-medium underline-offset-2 hover:underline" @click="changeEmail">
            Другая почта
          </button>
        </p>
        <UiInput
          v-model="code"
          label="Код из письма"
          inputmode="numeric"
          autocomplete="one-time-code"
          placeholder="000000"
          autofocus
        />
        <UiNotice :message="verify.result.value?.ok ? null : verify.result.value?.message" />
        <UiButton type="submit" :pending="verify.pending.value" :disabled="code.replace(/\D/g, '').length !== 6">
          Войти
        </UiButton>
        <UiButton variant="ghost" :pending="request.pending.value" @click="sendCode">Прислать код ещё раз</UiButton>
        <UiNotice :ok="request.result.value?.ok" :message="request.result.value?.ok ? null : request.result.value?.message" />
      </form>

      <!-- Организатор: почта и пароль -->
      <form v-else class="flex flex-col gap-4" @submit.prevent="signInWithPassword">
        <UiInput v-model="staffEmail" label="Почта" type="email" inputmode="email" autocomplete="username" />
        <UiInput v-model="password" label="Пароль" type="password" autocomplete="current-password" />
        <UiNotice :message="passwordLogin.result.value?.ok ? null : passwordLogin.result.value?.message" />
        <UiButton type="submit" :pending="passwordLogin.pending.value" :disabled="!staffEmail || !password">
          <KeyRound class="size-5" aria-hidden="true" />
          Войти
        </UiButton>
        <p class="text-ink-soft text-sm">
          Пароля ещё нет? Его задают по личной ссылке-приглашению от главного организатора.
        </p>
      </form>
    </section>
  </main>
</template>
