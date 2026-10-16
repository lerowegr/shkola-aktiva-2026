<script setup lang="ts">
import { KeyRound, Send } from "lucide-vue-next";

/**
 * Вход — один для всех: Telegram или логин/почта и пароль. Дальше сайт
 * сам ведёт по правам: организатора — в кабинет организатора, участника —
 * в личный кабинет.
 *
 * Регистрация участника — только через Telegram: первый вход и есть
 * регистрация, логин, почту и пароль человек задаёт при знакомстве.
 * «Забыли пароль?» ведёт в бота — он присылает временный пароль на 24 часа.
 */
useHead({ title: "Вход" });

const route = useRoute();

async function signedIn() {
  const user = await refreshSession();
  const from = typeof route.query.from === "string" && route.query.from.startsWith("/") && !route.query.from.startsWith("//") ? route.query.from : null;
  await navigateTo(from ?? homeFor(user));
}

// Уже вошёл — нечего делать на странице входа.
const current = await useSession();
if (current.value) await navigateTo(homeFor(current.value), { replace: true });

const telegram = useTelegramLogin(signedIn);
const bot = String(useRuntimeConfig().public.telegramBotUsername ?? "").replace(/^@/, "");
const resetLink = bot ? `https://t.me/${bot}?start=reset` : null;

const login = ref("");
const password = ref("");
const passwordLogin = useAction("/api/auth/password-login");

async function signInWithPassword() {
  const result = await passwordLogin.submit({ email: login.value, password: password.value });
  if (result.ok) await signedIn();
}
</script>

<template>
  <main class="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-8 px-4 py-10">
    <NuxtLink to="/" class="flex items-center gap-2 self-start font-display text-sm">
      <AppMark class="size-9 rounded-xl text-sm" />
      Школа Актива 2026
    </NuxtLink>

    <h1 class="font-display text-3xl">Вход</h1>

    <AppDemoLogin @signed-in="signedIn" />

    <section class="flex flex-col gap-5">
      <div class="flex flex-col gap-2">
        <UiButton
          v-if="telegram.available && telegram.link.value"
          variant="telegram"
          :href="telegram.link.value"
          target="_blank"
          @click="telegram.started"
        >
          <Send class="size-5" aria-hidden="true" />
          Регистрация и вход через Telegram
        </UiButton>
        <p v-else class="bg-brand-yellow-soft rounded-2xl px-4 py-3 text-sm">
          Регистрация — через Telegram. Бот вот-вот заработает, загляните чуть позже.
        </p>
        <p v-if="telegram.waiting.value" class="text-ink-soft text-center text-sm" aria-live="polite">
          Подтвердите вход в боте — эта страница обновится сама.
        </p>
        <UiNotice :message="telegram.message.value" />
      </div>

      <div class="text-ink-soft flex items-center gap-3 text-sm" aria-hidden="true">
        <span class="bg-line h-px flex-1" />
        или по паролю
        <span class="bg-line h-px flex-1" />
      </div>

      <form class="flex flex-col gap-4" @submit.prevent="signInWithPassword">
        <UiInput
          v-model="login"
          label="Логин или почта"
          type="text"
          inputmode="text"
          autocomplete="username"
        />
        <div class="flex flex-col gap-1.5">
          <UiInput v-model="password" label="Пароль" type="password" autocomplete="current-password" />
          <a v-if="resetLink" :href="resetLink" target="_blank" class="text-accent self-end text-sm font-medium hover:underline">Забыли пароль?</a>
        </div>
        <UiNotice :message="passwordLogin.result.value?.ok ? null : passwordLogin.result.value?.message" />
        <UiButton type="submit" :pending="passwordLogin.pending.value" :disabled="!login || !password">
          <KeyRound class="size-5" aria-hidden="true" />
          Войти
        </UiButton>
      </form>
    </section>
  </main>
</template>
