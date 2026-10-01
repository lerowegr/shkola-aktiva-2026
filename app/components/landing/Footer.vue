<script setup lang="ts">
import { siTelegram, siVk } from "simple-icons";

import type { SiteContent } from "~~/lib/site/content";

/** Подвал: контакты из админки (Telegram, ВКонтакте, почта) и вход в кабинет. */
defineProps<{ contacts: SiteContent["contacts"]; year: number }>();
</script>

<template>
  <footer class="bg-ink text-paper">
    <div class="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
      <div class="flex flex-col gap-3">
        <img src="/brand/logo-sticker-short.webp" alt="" width="56" height="56" class="size-14 rounded-full" loading="lazy">
        <p class="font-display text-2xl">Школа Актива {{ year }}</p>
      </div>
      <nav v-if="contacts.telegram || contacts.vk || contacts.email" class="flex flex-col gap-2" aria-label="Контакты">
        <p class="text-paper/60 text-sm">Связаться</p>
        <a v-if="contacts.telegram" :href="contacts.telegram" target="_blank" rel="noopener" class="inline-flex items-center gap-2 hover:underline">
          <svg viewBox="0 0 24 24" class="size-5 fill-current" aria-hidden="true"><path :d="siTelegram.path" /></svg>
          Telegram-канал
        </a>
        <a v-if="contacts.vk" :href="contacts.vk" target="_blank" rel="noopener" class="inline-flex items-center gap-2 hover:underline">
          <svg viewBox="0 0 24 24" class="size-5 fill-current" aria-hidden="true"><path :d="siVk.path" /></svg>
          ВКонтакте
        </a>
        <a v-if="contacts.email" :href="`mailto:${contacts.email}`" class="hover:underline">{{ contacts.email }}</a>
      </nav>
      <nav class="flex flex-col gap-2" aria-label="Кабинеты">
        <p class="text-paper/60 text-sm">Кабинет</p>
        <NuxtLink to="/login" class="hover:underline">Войти в кабинет</NuxtLink>
      </nav>
    </div>
  </footer>
</template>
