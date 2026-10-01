<script setup lang="ts">
import { ArrowDown, ArrowUp, ImagePlus, Trash2 } from "lucide-vue-next";

import type { PhotoRef } from "~~/lib/site/content";

/**
 * Фото в форме сайта: загрузить (можно несколько сразу), подписать,
 * переставить, убрать. Первое фото — обложка. На сайт изменения попадут
 * после «Сохранить»; убранные фото сервер удалит сам через час.
 */
const props = defineProps<{ max: number; label?: string }>();
const photos = defineModel<PhotoRef[]>({ required: true });

const input = ref<HTMLInputElement | null>(null);
const uploading = ref<{ done: number; total: number } | null>(null);
const errors = ref<string[]>([]);

async function upload(files: FileList | null) {
  if (!files?.length) return;
  const room = props.max - photos.value.length;
  const list = [...files].slice(0, Math.max(0, room));
  errors.value = files.length > room ? [`Поместится ещё ${room} — остальные не загружены.`] : [];
  uploading.value = { done: 0, total: list.length };

  for (const file of list) {
    const form = new FormData();
    form.append("file", file);
    const result = await $fetch<{ ok: boolean; message?: string; image?: { id: string } }>("/api/admin/site/images", {
      method: "POST",
      body: form,
      ignoreResponseError: true,
    }).catch(() => ({ ok: false, message: "Нет связи с сайтом. Проверьте интернет." }) as const);

    if (result.ok && "image" in result && result.image) photos.value = [...photos.value, { id: result.image.id, alt: "" }];
    else errors.value.push(`${file.name}: ${result.message ?? "не получилось загрузить."}`);
    uploading.value = { done: uploading.value.done + 1, total: list.length };
  }

  uploading.value = null;
  if (input.value) input.value.value = "";
}

function move(index: number, direction: -1 | 1) {
  const next = [...photos.value];
  const [item] = next.splice(index, 1);
  next.splice(index + direction, 0, item!);
  photos.value = next;
}

const remove = (index: number) => (photos.value = photos.value.filter((_, i) => i !== index));
const setAlt = (index: number, alt: string) =>
  (photos.value = photos.value.map((item, i) => (i === index ? { ...item, alt } : item)));
</script>

<template>
  <div class="flex flex-col gap-3">
    <p class="text-sm font-medium">{{ label ?? "Фото" }} <span class="text-ink-soft font-normal">· до {{ max }}</span></p>

    <ul v-if="photos.length" class="grid gap-3 sm:grid-cols-2">
      <li v-for="(photo, index) in photos" :key="photo.id" class="border-line bg-card flex gap-3 rounded-2xl border p-2">
        <img
          :src="`/media/site/${photo.id}/480.webp`"
          :alt="photo.alt"
          class="bg-line size-20 shrink-0 rounded-xl object-cover"
          loading="lazy"
        >
        <div class="flex min-w-0 flex-1 flex-col gap-1">
          <span class="text-ink-soft text-xs">{{ index === 0 ? "Обложка" : `Фото ${index + 1}` }}</span>
          <input
            :value="photo.alt"
            maxlength="160"
            placeholder="Что на фото"
            :aria-label="`Что на фото ${index + 1}`"
            class="border-line bg-paper min-h-9 rounded-lg border px-2 text-sm"
            @input="setAlt(index, ($event.target as HTMLInputElement).value)"
          >
          <span class="flex">
            <button type="button" class="hover:bg-paper grid size-8 place-items-center rounded-lg disabled:opacity-30" :disabled="index === 0" :aria-label="`Фото ${index + 1} раньше`" @click="move(index, -1)"><ArrowUp class="size-4" /></button>
            <button type="button" class="hover:bg-paper grid size-8 place-items-center rounded-lg disabled:opacity-30" :disabled="index === photos.length - 1" :aria-label="`Фото ${index + 1} позже`" @click="move(index, 1)"><ArrowDown class="size-4" /></button>
            <button type="button" class="hover:text-danger grid size-8 place-items-center rounded-lg" :aria-label="`Убрать фото ${index + 1}`" @click="remove(index)"><Trash2 class="size-4" /></button>
          </span>
        </div>
      </li>
    </ul>

    <label
      v-if="photos.length < max"
      class="border-line text-ink-soft hover:text-ink hover:border-ink-soft flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed px-4 text-sm"
      :class="{ 'pointer-events-none opacity-60': uploading }"
    >
      <ImagePlus class="size-4" aria-hidden="true" />
      {{ uploading ? `Загружаю ${uploading.done + 1} из ${uploading.total}…` : "Загрузить фото — JPEG, PNG или WebP, до 15 МБ" }}
      <input ref="input" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" multiple class="sr-only" @change="upload(($event.target as HTMLInputElement).files)">
    </label>

    <ul v-if="errors.length" class="text-danger flex flex-col gap-1 text-sm" role="status">
      <li v-for="(error, index) in errors" :key="index">{{ error }}</li>
    </ul>
  </div>
</template>
