<script setup lang="ts">
import { BellRing, KeyRound, Mail, Send, ShieldCheck, UserRound } from "lucide-vue-next";

import type { ActionResult } from "~/composables/useAction";

/**
 * Личный кабинет организатора: аватарка, как меня зовут, как я вхожу
 * (почта, Telegram, пароль), мои роли и моя работа в сезоне.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Мой кабинет" });

interface Me {
  firstName: string;
  lastName: string;
  email: string | null;
  login: string | null;
  telegram: { linked: boolean; username: string | null };
  passwordSetAt: string | null;
  isOwner: boolean;
  since: string;
  roles: { name: string; color: string | null }[];
  work: { stage: "APPLICATION" | "HOMEWORK" | "ASSESSMENT" | "INTERVIEW"; assigned: number; done: number }[];
  interviews: number;
}

const { data, refresh } = await useFetch<Me>("/api/staff/me");
const session = await useSession();

// Аватарка — та же, что у кандидатов: видна в шапке, в «Людях» и на дашборде.
const uploading = ref(false);
const avatarProblem = ref<string | null>(null);
async function uploadAvatar(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  avatarProblem.value = null;
  uploading.value = true;
  const body = new FormData();
  body.append("file", file);
  const result = await $fetch<{ ok: boolean; message?: string }>("/api/cabinet/profile/avatar", {
    method: "POST",
    body,
    ignoreResponseError: true,
  }).catch(() => ({ ok: false, message: "Нет связи с сайтом. Проверьте интернет." }));
  uploading.value = false;
  input.value = "";
  if (!result.ok) avatarProblem.value = result.message ?? "Не получилось загрузить фото.";
  else await refreshSession();
}
const removeAvatar = useAction("/api/cabinet/profile/avatar-delete");
async function dropAvatar() {
  const result = await removeAvatar.submit({});
  if (result.ok) await refreshSession();
}

const STAGE = { APPLICATION: "Анкеты", HOMEWORK: "Домашние задания", ASSESSMENT: "Центр оценки", INTERVIEW: "Собеседования" } as const;

const name = reactive({ firstName: data.value?.firstName ?? "", lastName: data.value?.lastName ?? "" });
const saving = ref(false);
const saved = ref<ActionResult | null>(null);
async function saveName() {
  saving.value = true;
  try {
    saved.value = await $fetch<ActionResult>("/api/staff/me/profile", { method: "POST", body: { ...name }, ignoreResponseError: true }).catch(
      (): ActionResult => ({ ok: false, message: "Нет связи с сайтом. Проверьте интернет." }),
    );
    if (saved.value.ok) {
      await refreshSession();
      await refresh();
    }
  } finally {
    saving.value = false;
  }
}

const link = useAction("/api/telegram/link");
async function linkTelegram() {
  const result = await link.submit({});
  if (result.ok && typeof result.link === "string") window.open(result.link, "_blank", "noopener");
}
// Вернулся из бота — подтянем, привязался ли Telegram.
function onVisible() {
  if (document.visibilityState === "visible") void refresh();
}
onMounted(() => document.addEventListener("visibilitychange", onVisible));
onBeforeUnmount(() => document.removeEventListener("visibilitychange", onVisible));
</script>

<template>
  <main v-if="data" class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
    <div class="flex items-center gap-4">
      <span class="bg-brand-green-soft grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl">
        <img v-if="session?.avatar" :src="session.avatar" alt="" class="size-full object-cover">
        <UserRound v-else class="size-8" aria-hidden="true" />
      </span>
      <div class="flex min-w-0 flex-col gap-1">
        <h1 class="font-display truncate text-3xl">{{ [data.firstName, data.lastName].filter(Boolean).join(" ") || "Мой кабинет" }}</h1>
        <div class="flex flex-wrap gap-1.5">
          <span v-if="data.isOwner" class="bg-ink text-paper rounded-md px-2 py-0.5 text-xs">владелец</span>
          <span
            v-for="role in data.roles"
            :key="role.name"
            class="rounded-md px-2 py-0.5 text-xs text-white"
            :style="{ background: role.color ?? 'var(--color-ink-soft)' }"
          >
            {{ role.name }}
          </span>
        </div>
      </div>
    </div>

    <!-- Аватарка -->
    <section class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
      <h2 class="font-display text-xl">Аватарка</h2>
      <p class="text-ink-soft text-sm">Фото до 5 МБ — обрежем в квадрат сами. Его видят организаторы в шапке, «Людях» и на дашборде.</p>
      <div class="flex flex-wrap gap-2">
        <label class="bg-accent text-accent-ink inline-flex min-h-11 cursor-pointer items-center justify-center rounded-2xl px-5 text-sm font-semibold">
          {{ uploading ? "Грузим…" : session?.avatar ? "Сменить фото" : "Выбрать фото" }}
          <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" :disabled="uploading" @change="uploadAvatar">
        </label>
        <div v-if="session?.avatar" class="shrink-0">
          <UiButton variant="ghost" :pending="removeAvatar.pending.value" @click="dropAvatar">Убрать</UiButton>
        </div>
      </div>
      <UiNotice :message="avatarProblem" />
    </section>

    <!-- Как меня зовут -->
    <section class="bg-card border-line flex flex-col gap-4 rounded-3xl border p-5">
      <div class="flex flex-col gap-1">
        <h2 class="font-display text-xl">Как меня зовут</h2>
        <p class="text-ink-soft text-sm">Так вас видят коллеги в оценках и кандидаты в ответах на сообщения.</p>
      </div>
      <form class="grid gap-4 sm:grid-cols-2" @submit.prevent="saveName">
        <UiInput v-model="name.firstName" label="Имя" autocomplete="given-name" />
        <UiInput v-model="name.lastName" label="Фамилия" autocomplete="family-name" />
        <UiNotice class="sm:col-span-2" :ok="saved?.ok" :message="saved?.message" />
        <div class="sm:col-span-2 sm:w-48">
          <UiButton type="submit" :pending="saving">Сохранить</UiButton>
        </div>
      </form>
    </section>

    <!-- Вход -->
    <section class="bg-card border-line flex flex-col gap-4 rounded-3xl border p-5">
      <h2 class="font-display text-xl">Вход</h2>
      <ul class="flex flex-col gap-3 text-sm">
        <li class="flex items-center gap-3">
          <Mail class="text-ink-soft size-5 shrink-0" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="text-ink-soft block">Почта</span>
            <span class="block truncate">{{ data.email ?? "не указана" }}</span>
          </span>
        </li>
        <li class="flex items-center gap-3">
          <Send class="text-ink-soft size-5 shrink-0" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="text-ink-soft block">Telegram</span>
            <span class="block">
              {{ data.telegram.linked ? (data.telegram.username ? `@${data.telegram.username}` : "привязан") : "не привязан — уведомления и «Забыли пароль?» не дойдут" }}
            </span>
          </span>
          <div v-if="!data.telegram.linked" class="w-36 shrink-0">
            <UiButton variant="telegram" :pending="link.pending.value" @click="linkTelegram">Привязать</UiButton>
          </div>
        </li>
        <li class="flex items-center gap-3">
          <KeyRound class="text-ink-soft size-5 shrink-0" aria-hidden="true" />
          <span class="min-w-0 flex-1">
            <span class="text-ink-soft block">Пароль</span>
            <span class="block">{{ data.passwordSetAt ? `задан ${mskFormat(data.passwordSetAt, "d MMMM yyyy")}` : "не задан" }}</span>
          </span>
          <div class="w-36 shrink-0">
            <UiButton variant="ghost" href="/password">Сменить</UiButton>
          </div>
        </li>
      </ul>
      <UiNotice :ok="link.result.value?.ok" :message="link.result.value?.ok ? null : link.result.value?.message" />
    </section>

    <!-- Моя работа -->
    <section class="bg-card border-line flex flex-col gap-4 rounded-3xl border p-5">
      <h2 class="font-display text-xl">Моя работа в сезоне</h2>
      <p v-if="data.work.length === 0 && data.interviews === 0" class="text-ink-soft text-sm">Пока ничего не назначено.</p>
      <ul v-else class="grid gap-3 sm:grid-cols-2">
        <li v-for="row in data.work" :key="row.stage" class="bg-paper flex flex-col gap-1 rounded-2xl p-4">
          <span class="text-ink-soft text-sm">{{ STAGE[row.stage] }}</span>
          <span class="text-2xl font-semibold">{{ row.done }} <span class="text-ink-soft text-base font-normal">из {{ row.assigned }} оценено</span></span>
        </li>
        <li v-if="data.interviews" class="bg-paper flex flex-col gap-1 rounded-2xl p-4">
          <span class="text-ink-soft text-sm">Собеседования впереди</span>
          <span class="text-2xl font-semibold">{{ data.interviews }}</span>
        </li>
      </ul>
    </section>

    <div class="grid gap-3 sm:grid-cols-2">
      <NuxtLink to="/cabinet/settings" class="bg-card border-line hover:border-ink-soft flex items-center gap-3 rounded-3xl border p-4 transition">
        <span class="bg-brand-yellow-soft grid size-11 place-items-center rounded-2xl"><BellRing class="size-5" aria-hidden="true" /></span>
        <span class="font-semibold">Уведомления</span>
      </NuxtLink>
      <div class="bg-card border-line flex items-center gap-3 rounded-3xl border p-4">
        <span class="bg-brand-blue-soft grid size-11 place-items-center rounded-2xl"><ShieldCheck class="size-5" aria-hidden="true" /></span>
        <span class="text-ink-soft text-sm">Роли и права выдаёт тех.админ в «Админка → Люди».</span>
      </div>
    </div>
  </main>
</template>
