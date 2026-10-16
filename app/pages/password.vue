<script setup lang="ts">
import { KeyRound } from "lucide-vue-next";

import type { ActionResult } from "~/composables/useAction";
import { passwordProblem } from "~~/lib/auth/password-rules";

/**
 * Новый пароль. Сюда сайт приводит после входа временным паролем из бота
 * и не пускает дальше, пока пароль не задан.
 */
useHead({ title: "Новый пароль" });

const user = await useSession();
if (!user.value) await navigateTo("/login", { replace: true });

const form = reactive({ password: "", repeat: "" });
const touched = reactive({ password: false, repeat: false });
const pending = ref(false);
const reply = ref<ActionResult | null>(null);

const errors = computed(() => ({
  password: (touched.password && form.password ? passwordProblem(form.password) : null) ?? (reply.value?.field === "password" ? reply.value.message : null),
  repeat: (touched.repeat && form.repeat && form.repeat !== form.password ? "Пароли не совпадают." : null) ?? (reply.value?.field === "repeat" ? reply.value.message : null),
}));

async function save() {
  touched.password = touched.repeat = true;
  if (passwordProblem(form.password) || form.password !== form.repeat) return;
  pending.value = true;
  try {
    reply.value = await $fetch<ActionResult>("/api/auth/password-change", { method: "POST", body: { ...form }, ignoreResponseError: true }).catch(
      (): ActionResult => ({ ok: false, message: "Нет связи с сайтом. Проверьте интернет и нажмите ещё раз." }),
    );
    if (reply.value.ok) {
      const fresh = await refreshSession();
      await navigateTo(homeFor(fresh), { replace: true });
    }
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <main class="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
    <div class="flex flex-col gap-2">
      <h1 class="font-display text-3xl">Новый пароль</h1>
      <p class="text-ink-soft">
        {{ user?.mustChangePassword ? "Вы вошли временным паролем из бота. Придумайте свой — временный после этого перестанет работать." : "Придумайте новый пароль для входа." }}
      </p>
    </div>
    <form class="flex flex-col gap-4" novalidate @submit.prevent="save">
      <div @focusout="touched.password = true">
        <UiInput v-model="form.password" label="Новый пароль — от 8 знаков" type="password" autocomplete="new-password" :hint="errors.password" :invalid="!!errors.password" />
      </div>
      <div @focusout="touched.repeat = true">
        <UiInput v-model="form.repeat" label="Пароль ещё раз" type="password" autocomplete="new-password" :hint="errors.repeat" :invalid="!!errors.repeat" />
      </div>
      <UiNotice :message="reply && !reply.ok && !reply.field ? reply.message : null" />
      <UiButton type="submit" :pending="pending"><KeyRound class="size-5" aria-hidden="true" /> Сохранить пароль</UiButton>
    </form>
  </main>
</template>
