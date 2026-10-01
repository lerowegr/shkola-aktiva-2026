<script setup lang="ts">
import { passwordProblem } from "~~/lib/auth/password-rules";

useHead({ title: "Приглашение" });

const route = useRoute();
const token = String(route.params.token);

const { data: invite } = await useFetch("/api/auth/invite-check", { query: { token } });

const password = ref("");
const repeat = ref("");
const accept = useAction("/api/auth/invite-accept");

// Подсказка появляется, когда человек уже что-то ввёл, а не с порога.
const problem = computed(() =>
  password.value ? passwordProblem(password.value, { email: invite.value?.ok ? invite.value.email : null }) : null,
);
const mismatch = computed(() => repeat.value.length > 0 && repeat.value !== password.value);

async function submit() {
  const result = await accept.submit({ token, password: password.value });
  if (result.ok) {
    await refreshSession();
    await navigateTo("/staff");
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
    <span class="bg-lime grid size-12 place-items-center rounded-2xl font-display">ША</span>

    <template v-if="invite?.ok">
      <div class="flex flex-col gap-2">
        <h1 class="font-display text-3xl">
          {{ invite.name ? `${invite.name}, добро пожаловать` : "Добро пожаловать" }}
        </h1>
        <p class="text-ink-soft">
          Вас пригласили в команду отбора Школы Актива. Придумайте пароль — логином будет почта
          <b>{{ invite.email }}</b>.
        </p>
      </div>

      <form class="flex flex-col gap-4" @submit.prevent="submit">
        <input type="email" :value="invite.email ?? ''" autocomplete="username" class="hidden" readonly >
        <UiInput
          v-model="password"
          label="Пароль"
          type="password"
          autocomplete="new-password"
          :hint="problem ?? 'Не короче 8 знаков. Фраза из нескольких слов — отличный пароль.'"
          :invalid="!!problem"
        />
        <UiInput
          v-model="repeat"
          label="Ещё раз"
          type="password"
          autocomplete="new-password"
          :hint="mismatch ? 'Пароли не совпадают.' : null"
          :invalid="mismatch"
        />
        <UiNotice :message="accept.result.value?.ok ? null : accept.result.value?.message" />
        <UiButton
          type="submit"
          :pending="accept.pending.value"
          :disabled="!password || !!problem || repeat !== password"
        >
          Задать пароль и войти
        </UiButton>
      </form>
    </template>

    <template v-else>
      <h1 class="font-display text-2xl">Ссылка не работает</h1>
      <UiNotice :message="invite?.ok === false ? invite.message : 'Приглашение не найдено.'" />
      <UiButton href="/login?as=staff" variant="ghost">На страницу входа</UiButton>
    </template>
  </main>
</template>
