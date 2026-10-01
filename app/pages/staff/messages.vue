<script setup lang="ts">
import { refDebounced } from "@vueuse/core";
import { Search } from "lucide-vue-next";

import type { ThreadRow } from "~~/lib/messages/threads";

/**
 * «Сообщения» как в шаблоне: слева переписки кандидатов, справа выбранная.
 * Ответ кандидат получает и на сайте, и от бота. На телефоне — по очереди:
 * список, потом переписка.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Сообщения" });

const route = useRoute();
const router = useRouter();
const search = ref("");
const q = refDebounced(search, 250);

const { data: list, refresh: refreshList } = await useFetch<{ rows: ThreadRow[]; unread: number }>("/api/staff/messages", {
  query: { q },
});

const selected = computed(() => (typeof route.query.thread === "string" ? route.query.thread : null));

function choose(id: string) {
  void router.replace({ query: { ...route.query, thread: id } });
}

async function onRead() {
  await refreshList();
  await refreshNuxtData("staff-nav");
}

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => (timer = setInterval(() => void refreshList(), 10_000)));
onBeforeUnmount(() => timer && clearInterval(timer));

const STATUS = { none: "без анкеты", draft: "анкета: черновик", submitted: "анкета отправлена" } as const;
const when = (date: Date | string) =>
  mskIsToday(date) ? mskTime(date) : mskFormat(date, "d MMM");
</script>

<template>
  <main class="mx-auto flex h-[calc(100dvh-112px)] max-w-6xl flex-col gap-4 px-4 py-6">
    <div class="flex flex-col gap-1" :class="selected ? 'hidden md:flex' : ''">
      <h1 class="font-display text-3xl">Сообщения</h1>
      <p class="text-ink-soft max-w-2xl text-sm">
        Переписка с кандидатами: что они пишут на сайте и боту, что отвечает бот и что пишете вы. Ваш ответ кандидат
        получит от бота.
      </p>
    </div>

    <div class="bg-card border-line grid min-h-0 flex-1 overflow-hidden rounded-3xl border md:grid-cols-[320px_1fr]">
      <!-- Список переписок -->
      <aside class="border-line flex min-h-0 flex-col md:border-r" :class="selected ? 'hidden md:flex' : 'flex'">
        <label class="relative m-3">
          <span class="sr-only">Поиск</span>
          <Search class="text-ink-soft absolute top-1/2 left-3.5 size-4 -translate-y-1/2" aria-hidden="true" />
          <input
            v-model="search"
            type="search"
            placeholder="Поиск по имени или Telegram"
            class="border-line bg-paper focus:border-accent min-h-11 w-full rounded-2xl border pr-3 pl-10 text-sm outline-none"
          >
        </label>
        <ul class="min-h-0 flex-1 overflow-y-auto">
          <li v-for="row in list?.rows ?? []" :key="row.id">
            <button
              type="button"
              class="hover:bg-paper flex w-full gap-3 px-3 py-3 text-left"
              :class="selected === row.id ? 'bg-paper' : ''"
              @click="choose(row.id)"
            >
              <StaffAvatar :seed="row.id" :text="row.initials" />
              <span class="min-w-0 flex-1">
                <span class="flex items-center justify-between gap-2">
                  <span class="truncate text-sm font-semibold">{{ row.name }}</span>
                  <span class="text-ink-soft shrink-0 text-xs">{{ when(row.lastMessageAt) }}</span>
                </span>
                <span class="flex items-center justify-between gap-2">
                  <span class="text-ink-soft truncate text-sm">
                    <template v-if="row.lastAuthor === 'STAFF'">Вы: </template>{{ row.lastText }}
                  </span>
                  <span v-if="row.unread" class="bg-accent size-2.5 shrink-0 rounded-full" aria-label="новое" />
                </span>
                <span class="text-ink-soft block truncate text-xs">
                  <template v-if="row.telegramUsername">@{{ row.telegramUsername }} · </template>{{ STATUS[row.applicationStatus] }}
                </span>
              </span>
            </button>
          </li>
        </ul>
        <p v-if="list && list.rows.length === 0" class="text-ink-soft p-6 text-center text-sm">
          {{ search ? "Никого не нашли." : "Кандидаты ещё ничего не писали." }}
        </p>
      </aside>

      <!-- Переписка -->
      <section class="flex min-h-0 flex-col" :class="selected ? 'flex' : 'hidden md:flex'">
        <StaffThread v-if="selected" :id="selected" :key="selected" @back="router.replace({ query: {} })" @read="onRead" />
        <p v-else class="text-ink-soft m-auto p-6 text-center text-sm">Выберите переписку слева.</p>
      </section>
    </div>
  </main>
</template>
