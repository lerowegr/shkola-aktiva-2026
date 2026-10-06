<script setup lang="ts">
import { ArrowLeft } from "lucide-vue-next";

import { avatarLetters } from "~~/lib/profile/display";

/**
 * Профиль для рейтинга: ник, аватарка и предпросмотр «как видят другие».
 * Ник меняется раз в 7 дней — сервер объяснит, если рано.
 */
useHead({ title: "Профиль" });

const { data: profile, refresh } = await useFetch<{
  nickname: string | null;
  avatar: string | null;
  displayName: string;
}>("/api/cabinet/profile");

const nickname = ref("");
const saved = ref(false);
const problem = ref<string | null>(null);
onMounted(() => {
  if (profile.value?.nickname) nickname.value = profile.value.nickname;
});

const rename = useAction("/api/cabinet/profile/nickname");
async function saveNickname() {
  problem.value = null;
  saved.value = false;
  const result = (await rename.submit({ nickname: nickname.value })) as { ok: boolean; message?: string };
  if (!result.ok) {
    problem.value = result.message ?? "Не получилось.";
    return;
  }
  saved.value = true;
  await refresh();
}

const uploading = ref(false);
async function upload(event: Event) {
  const files = (event.target as HTMLInputElement).files;
  if (!files?.length) return;
  problem.value = null;
  uploading.value = true;
  const body = new FormData();
  body.append("file", files[0]!);
  const result = await $fetch<{ ok: boolean; message?: string }>("/api/cabinet/profile/avatar", {
    method: "POST",
    body,
    ignoreResponseError: true,
  });
  uploading.value = false;
  if (!result.ok) {
    problem.value = result.message ?? "Не получилось.";
    return;
  }
  await refresh();
}

const removeAvatar = useAction("/api/cabinet/profile/avatar-delete");
async function remove() {
  await removeAvatar.submit({});
  await refresh();
}
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6">
      <NuxtLink to="/cabinet" class="text-ink-soft hover:text-ink inline-flex items-center gap-1 self-start text-sm">
        <ArrowLeft class="size-4" aria-hidden="true" /> Кабинет
      </NuxtLink>
      <h1 class="font-display text-3xl">Профиль</h1>

      <section class="bg-card border-line flex items-center gap-4 rounded-3xl border p-5" aria-label="Как видят в рейтинге">
        <span class="font-display grid size-16 shrink-0 place-items-center overflow-hidden rounded-full bg-line text-xl">
          <img v-if="profile?.avatar" :src="profile.avatar" alt="" class="size-full object-cover">
          <span v-else aria-hidden="true">{{ avatarLetters(profile?.displayName ?? "?") }}</span>
        </span>
        <span>
          <span class="block text-lg font-semibold">{{ profile?.displayName ?? "…" }}</span>
          <span class="text-ink-soft block text-sm">Так вас видят в рейтинге. Настоящее имя — только у организаторов.</span>
        </span>
      </section>

      <section class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
        <h2 class="font-semibold">Никнейм</h2>
        <p class="text-ink-soft text-sm">От 3 до 20 символов: буквы, цифры и подчёркивание. Менять можно раз в 7 дней.</p>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-end">
          <UiInput v-model="nickname" label="Никнейм" class="flex-1" />
          <div class="shrink-0">
            <UiButton :pending="rename.pending.value" @click="saveNickname">Ок</UiButton>
          </div>
        </div>
        <p v-if="saved" class="text-ok text-sm">Сохранено.</p>
        <UiNotice :message="problem" />
      </section>

      <section class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
        <h2 class="font-semibold">Аватарка</h2>
        <p class="text-ink-soft text-sm">Фото до 5 МБ — обрежем в квадрат сами.</p>
        <div class="flex flex-wrap gap-2">
          <label class="bg-accent text-accent-ink inline-flex min-h-11 cursor-pointer items-center justify-center rounded-2xl px-5 text-sm font-semibold">
            {{ uploading ? "Грузим…" : "Выбрать фото" }}
            <input type="file" accept="image/jpeg,image/png,image/webp" class="sr-only" :disabled="uploading" @change="upload">
          </label>
          <div v-if="profile?.avatar" class="shrink-0">
            <UiButton variant="ghost" @click="remove">Убрать</UiButton>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
