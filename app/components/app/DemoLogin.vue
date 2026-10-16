<script setup lang="ts">
import { LogIn } from "lucide-vue-next";

import type { ActionResult } from "~/composables/useAction";

/**
 * Демо-копия: «Войти как…» — организатор или кандидат на нужном этапе, в
 * один клик, без пароля. На боевом сайте компонент пуст: флага demo нет.
 */
const emit = defineEmits<{ signedIn: [] }>();
const demo = useRuntimeConfig().public.demo === true;

interface Account {
  id: string;
  name: string;
  about: string;
  staff: boolean;
}
const { data } = useFetch<{ accounts: Account[] }>("/api/demo/accounts", { immediate: demo, server: false });
const staff = computed(() => (data.value?.accounts ?? []).filter((item) => item.staff));
const candidates = computed(() => (data.value?.accounts ?? []).filter((item) => !item.staff));

const busy = ref<string | null>(null);
const problem = ref<string | null>(null);
async function enter(account: Account) {
  busy.value = account.id;
  problem.value = null;
  const result = await $fetch<ActionResult>("/api/demo/login", { method: "POST", body: { userId: account.id }, ignoreResponseError: true }).catch(
    (): ActionResult => ({ ok: false, message: "Нет связи с сайтом." }),
  );
  busy.value = null;
  if (result.ok) emit("signedIn");
  else problem.value = result.message ?? "Не получилось войти.";
}
</script>

<template>
  <section v-if="demo" class="border-brand-yellow bg-brand-yellow-soft/50 flex flex-col gap-4 rounded-3xl border-2 border-dashed p-4">
    <div class="flex flex-col gap-1">
      <h2 class="font-display text-xl">Войти как…</h2>
      <p class="text-ink-soft text-sm">Демо: выберите, чьими глазами посмотреть на отбор. Пароли не нужны.</p>
    </div>
    <p v-if="data && !data.accounts.length" class="text-sm">Демо-людей нет — нажмите «Сбросить демо» в полосе сверху.</p>
    <template v-for="group in [{ title: 'Организаторы', items: staff }, { title: 'Кандидаты', items: candidates }]" :key="group.title">
      <div v-if="group.items.length" class="flex flex-col gap-2">
        <h3 class="text-ink-soft text-xs font-semibold tracking-wide uppercase">{{ group.title }}</h3>
        <button
          v-for="account in group.items"
          :key="account.id"
          type="button"
          class="bg-card border-line hover:border-accent flex min-h-12 items-center gap-3 rounded-2xl border px-3 py-2 text-left transition disabled:opacity-60"
          :disabled="busy !== null"
          @click="enter(account)"
        >
          <span class="min-w-0 flex-1">
            <span class="block text-sm font-semibold">{{ account.name }}</span>
            <span class="text-ink-soft block text-xs">{{ account.about }}</span>
          </span>
          <LogIn class="text-accent size-4 shrink-0" aria-hidden="true" />
        </button>
      </div>
    </template>
    <UiNotice :message="problem" />
  </section>
</template>
