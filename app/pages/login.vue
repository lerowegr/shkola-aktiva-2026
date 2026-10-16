<script setup lang="ts">
import { KeyRound, Send, UserPlus } from "lucide-vue-next";

import { loginProblem } from "~~/lib/auth/login";
import { passwordProblem } from "~~/lib/auth/password-rules";

/**
 * Вход и регистрация. Два способа и только они: Telegram (первый вход и
 * есть регистрация) или пароль. Пароль — почта у организаторов (задают по
 * приглашению), логин у тех, кто зарегистрировался здесь сам.
 * После регистрации — знакомство (/cabinet/welcome), его требует кабинет.
 */
useHead({ title: "Вход" });

const route = useRoute();
const mode = ref<"signin" | "register">(route.query.tab === "register" ? "register" : "signin");

async function signedIn() {
  const user = await refreshSession();
  const from = typeof route.query.from === "string" && route.query.from.startsWith("/") && !route.query.from.startsWith("//") ? route.query.from : null;
  await navigateTo(from ?? homeFor(user));
}

// Уже вошёл — нечего делать на странице входа.
const current = await useSession();
if (current.value) await navigateTo(homeFor(current.value), { replace: true });

const telegram = useTelegramLogin(signedIn);

// --- Вход по паролю ----------------------------------------------------------
const login = ref("");
const password = ref("");
const passwordLogin = useAction("/api/auth/password-login");

async function signInWithPassword() {
  const result = await passwordLogin.submit({ email: login.value, password: password.value });
  if (result.ok) await signedIn();
}

// --- Регистрация ---------------------------------------------------------------
const reg = reactive({ login: "", password: "", repeat: "" });
const touched = reactive({ login: false, password: false, repeat: false });
const register = useAction("/api/auth/register");

// Подсказки — те же правила, что на сервере, но только после того, как
// человек ушёл из поля: не ругаться на каждую букву.
const regErrors = computed(() => ({
  login: touched.login ? loginProblem(reg.login) : null,
  password: touched.password && reg.password ? passwordProblem(reg.password) : null,
  repeat: touched.repeat && reg.repeat && reg.repeat !== reg.password ? "Пароли не совпадают." : null,
}));
const serverField = computed(() => {
  const result = register.result.value;
  return result && !result.ok ? (result.field as "login" | "password" | "repeat" | undefined) : undefined;
});

async function signUp() {
  touched.login = touched.password = touched.repeat = true;
  if (loginProblem(reg.login) || passwordProblem(reg.password) || reg.password !== reg.repeat) return;
  const result = await register.submit({ ...reg });
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
      <h1 class="font-display text-3xl">{{ mode === "register" ? "Регистрация" : "Вход" }}</h1>
      <p class="text-ink-soft">
        {{
          telegram.available
            ? "Быстрее всего — через Telegram: первый вход и есть регистрация на отбор."
            : "Впервые здесь — зарегистрируйтесь: придумайте логин и пароль."
        }}
      </p>
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
      </div>

      <div v-if="telegram.available" class="text-ink-soft flex items-center gap-3 text-sm" aria-hidden="true">
        <span class="bg-line h-px flex-1" />
        или по паролю
        <span class="bg-line h-px flex-1" />
      </div>

      <div role="tablist" class="bg-line/60 grid grid-cols-2 gap-1 rounded-2xl p-1">
        <button
          v-for="tab in [
            { key: 'signin', label: 'Вход' },
            { key: 'register', label: 'Регистрация' },
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

      <form v-if="mode === 'signin'" class="flex flex-col gap-4" @submit.prevent="signInWithPassword">
        <UiInput v-model="login" label="Логин или почта" autocomplete="username" />
        <UiInput v-model="password" label="Пароль" type="password" autocomplete="current-password" />
        <UiNotice :message="passwordLogin.result.value?.ok ? null : passwordLogin.result.value?.message" />
        <UiButton type="submit" :pending="passwordLogin.pending.value" :disabled="!login || !password">
          <KeyRound class="size-5" aria-hidden="true" />
          Войти
        </UiButton>
        <p class="text-ink-soft text-sm">
          Организаторы входят почтой — пароль задаётся по личной ссылке-приглашению. Нет аккаунта —
          <button type="button" class="text-accent font-medium hover:underline" @click="mode = 'register'">зарегистрируйтесь</button>.
        </p>
      </form>

      <form v-else class="flex flex-col gap-4" novalidate @submit.prevent="signUp">
        <div @focusout="touched.login = true">
          <UiInput
            v-model="reg.login"
            label="Придумайте логин"
            autocomplete="username"
            placeholder="Латиница и цифры, например anna.k"
            :hint="regErrors.login ?? (serverField === 'login' ? register.result.value?.message : null)"
            :invalid="!!regErrors.login || serverField === 'login'"
          />
        </div>
        <div @focusout="touched.password = true">
          <UiInput
            v-model="reg.password"
            label="Пароль — от 8 знаков"
            type="password"
            autocomplete="new-password"
            :hint="regErrors.password ?? (serverField === 'password' ? register.result.value?.message : null)"
            :invalid="!!regErrors.password || serverField === 'password'"
          />
        </div>
        <div @focusout="touched.repeat = true">
          <UiInput
            v-model="reg.repeat"
            label="Пароль ещё раз"
            type="password"
            autocomplete="new-password"
            :hint="regErrors.repeat ?? (serverField === 'repeat' ? register.result.value?.message : null)"
            :invalid="!!regErrors.repeat || serverField === 'repeat'"
          />
        </div>
        <UiNotice :message="register.result.value && !register.result.value.ok && !serverField ? register.result.value.message : null" />
        <UiButton type="submit" :pending="register.pending.value">
          <UserPlus class="size-5" aria-hidden="true" />
          Зарегистрироваться
        </UiButton>
        <p class="text-ink-soft text-sm">Запомните логин и пароль: восстановить их можно только через организаторов.</p>
      </form>
    </section>
  </main>
</template>
