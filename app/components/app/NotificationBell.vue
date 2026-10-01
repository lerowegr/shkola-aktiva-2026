<script setup lang="ts">
import { formatDistanceToNowStrict } from "date-fns";
import { ru } from "date-fns/locale";
import { Bell, CheckCheck } from "lucide-vue-next";

import type { InboxItem } from "~~/lib/notifications/inbox";

/**
 * Колокольчик: последние уведомления и сколько непрочитанных.
 *
 * Сервер опрашиваем раз в 30 секунд и при возвращении на вкладку — этого
 * хватает, чтобы ответ организатора появился, пока человек на сайте, и
 * не ушёл через минуту дублем в Telegram.
 */
const { data, refresh } = await useFetch<{ items: InboxItem[]; unread: number }>("/api/notifications", {
  key: "inbox",
  default: () => ({ items: [], unread: 0 }),
});

const open = ref(false);
const root = ref<HTMLElement | null>(null);

let timer: ReturnType<typeof setInterval> | null = null;
function onVisible() {
  if (document.visibilityState === "visible") void refresh();
}
function onOutside(event: MouseEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false;
}
function onKey(event: KeyboardEvent) {
  if (event.key === "Escape") open.value = false;
}

onMounted(() => {
  timer = setInterval(() => void refresh(), 30_000);
  document.addEventListener("visibilitychange", onVisible);
  document.addEventListener("click", onOutside);
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  document.removeEventListener("visibilitychange", onVisible);
  document.removeEventListener("click", onOutside);
  document.removeEventListener("keydown", onKey);
});

async function read(ids?: string[]) {
  await $fetch("/api/notifications/read", { method: "POST", body: ids ? { ids } : {}, ignoreResponseError: true });
  await refresh();
}

async function openItem(item: InboxItem) {
  open.value = false;
  if (!item.read) await read([item.id]);
  if (item.url) await navigateTo(item.url);
}

const ago = (date: Date | string) => formatDistanceToNowStrict(new Date(date), { locale: ru, addSuffix: true });
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      class="text-paper/80 hover:text-paper relative grid size-10 place-items-center rounded-xl hover:bg-white/10"
      :aria-label="data.unread ? `Уведомления: ${data.unread} новых` : 'Уведомления'"
      :aria-expanded="open"
      @click="open = !open"
    >
      <Bell class="size-5" aria-hidden="true" />
      <span
        v-if="data.unread"
        class="bg-brand-red absolute top-1 right-1 grid min-w-4.5 place-items-center rounded-full px-1 text-[10px] leading-4.5 font-bold text-white"
      >
        {{ data.unread > 9 ? "9+" : data.unread }}
      </span>
    </button>

    <div
      v-if="open"
      class="bg-card text-ink border-line fixed inset-x-3 top-16 z-50 flex max-h-[70dvh] flex-col overflow-hidden rounded-3xl border shadow-2xl sm:absolute sm:inset-x-auto sm:top-12 sm:right-0 sm:w-96"
      role="dialog"
      aria-label="Уведомления"
    >
      <div class="border-line flex items-center justify-between border-b px-4 py-3">
        <p class="font-semibold">Уведомления</p>
        <button
          v-if="data.unread"
          type="button"
          class="text-accent flex items-center gap-1 text-sm font-medium"
          @click="read()"
        >
          <CheckCheck class="size-4" aria-hidden="true" /> Прочитать все
        </button>
      </div>

      <ul class="overflow-y-auto">
        <li v-for="item in data.items" :key="item.id" class="border-line border-b last:border-b-0">
          <button
            type="button"
            class="hover:bg-paper flex w-full gap-3 px-4 py-3 text-left"
            @click="openItem(item)"
          >
            <span class="mt-1.5 size-2 shrink-0 rounded-full" :class="item.read ? 'bg-transparent' : 'bg-accent'" />
            <span class="min-w-0 flex-1">
              <span class="block text-sm font-semibold">{{ item.title }}</span>
              <span v-if="item.body" class="text-ink-soft line-clamp-2 block text-sm">{{ item.body }}</span>
              <span class="text-ink-soft mt-0.5 block text-xs">{{ ago(item.createdAt) }}</span>
            </span>
          </button>
        </li>
      </ul>

      <p v-if="data.items.length === 0" class="text-ink-soft px-4 py-8 text-center text-sm">Пока ничего нового.</p>

      <NuxtLink to="/cabinet/settings" class="border-line text-ink-soft hover:text-ink border-t px-4 py-3 text-center text-sm" @click="open = false">
        Настроить уведомления
      </NuxtLink>
    </div>
  </div>
</template>
