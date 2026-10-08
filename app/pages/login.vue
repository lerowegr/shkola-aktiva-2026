<script setup lang="ts">
import { KeyRound, Send } from "lucide-vue-next";

useHead({ title: "Вход" });

const route = useRoute();

async function signedIn() {
  const user = await refreshSession();
  const from = typeof route.query.from === "string" && route.query.from.startsWith("/") ? route.query.from : null;
  await navigateTo(from ?? homeFor(user));
}

// Уже вошёл — нечего делать на странице входа.
const current = await useSession();
if (current.value) await navigateTo(homeFor(current.value), { replace: true });

const telegram = useTelegramLogin(signedIn);

// --- Логин и пароль ---------------------------------------------------------
// Пароль задаётся по ссылке-приглашению. На превью вместо почты можно набрать
// короткий логин тестового входа (admin, kandidat) — см. lib/auth/preview-login.
const preview = useRuntimeConfig().public.previewLogins === true;
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
      <span class="bg-lime grid size-9 place-items-center rounded-xl">ША</span>
      Школа Актива 2026
    </NuxtLink>

    <div class="flex flex-col gap-2">
      <h1 class="font-display text-3xl">Вход</h1>
      <p class="text-ink-soft">Участникам — через Telegram: первый вход и есть регистрация на отбор.</p>
    </div>

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

      <div class="text-ink-soft flex items-center gap-3 text-sm" aria-hidden="true">
        <span class="bg-line h-px flex-1" />
        или по паролю
        <span class="bg-line h-px flex-1" />
      </div>

      <form class="flex flex-col gap-4" @submit.prevent="signInWithPassword">
        <UiInput
          v-model="login"
          :label="preview ? 'Почта или логин' : 'Почта'"
          autocomplete="username"
          :placeholder="preview ? 'Тестовый вход: admin или kandidat' : undefined"
        />
        <UiInput v-model="password" label="Пароль" type="password" autocomplete="current-password" />
        <UiNotice :message="passwordLogin.result.value?.ok ? null : passwordLogin.result.value?.message" />
        <UiButton type="submit" variant="ghost" :pending="passwordLogin.pending.value" :disabled="!login || !password">
          <KeyRound class="size-5" aria-hidden="true" />
          Войти
        </UiButton>
        <p class="text-ink-soft text-sm">
          Пароль есть у организаторов: его задают по личной ссылке-приглашению от главного организатора.
        </p>
      </form>
    </section>
  </main>
</template>
