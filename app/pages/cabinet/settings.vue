<script setup lang="ts">
import { BellRing, Send, Smartphone } from "lucide-vue-next";

import type { PreferenceRow } from "~~/lib/notifications/inbox";

/** Куда приходят уведомления: Telegram, пуши на это устройство, по темам. */
useHead({ title: "Уведомления" });

const { data, refresh } = await useFetch<{
  rows: PreferenceRow[];
  telegram: { linked: boolean; username: string | null };
  pushDevices: number;
}>("/api/notifications/preferences");

const push = usePush();

async function toggle(row: PreferenceRow, channel: "TELEGRAM" | "PUSH") {
  const enabled = !row.channels[channel];
  row.channels[channel] = enabled;
  await $fetch("/api/notifications/preferences", {
    method: "POST",
    body: { channel, category: row.category, enabled },
    ignoreResponseError: true,
  });
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
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div class="flex flex-col gap-1">
        <NuxtLink to="/cabinet" class="text-ink-soft hover:text-ink text-sm">← Кабинет</NuxtLink>
        <h1 class="font-display text-3xl">Уведомления</h1>
        <p class="text-ink-soft text-sm">
          На сайте уведомления видны всегда — в колокольчике. Здесь — куда ещё их присылать.
        </p>
      </div>

      <!-- Telegram -->
      <section class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
        <div class="flex items-center gap-3">
          <span class="grid size-11 place-items-center rounded-2xl bg-[#229ED9]/15 text-[#229ED9]">
            <Send class="size-5" aria-hidden="true" />
          </span>
          <div class="flex-1">
            <h2 class="font-semibold">Telegram</h2>
            <p class="text-ink-soft text-sm">
              {{
                data?.telegram.linked
                  ? `Привязан${data.telegram.username ? ` — @${data.telegram.username}` : ""}. Сообщения приходят от бота, кнопка в них открывает сайт прямо в Telegram.`
                  : "Не привязан. Привяжите, чтобы получать новости отбора и ответы организаторов в Telegram."
              }}
            </p>
          </div>
        </div>
        <template v-if="!data?.telegram.linked">
          <UiButton variant="telegram" :pending="link.pending.value" @click="linkTelegram">Привязать Telegram</UiButton>
          <UiNotice :message="link.result.value?.ok === false ? link.result.value.message : null" />
          <p v-if="link.result.value?.ok" class="text-ink-soft text-sm">
            Нажмите Start в открывшемся боте и возвращайтесь — страница обновится сама.
          </p>
        </template>
      </section>

      <!-- Пуши -->
      <section class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
        <div class="flex items-center gap-3">
          <span class="bg-accent/10 text-accent grid size-11 place-items-center rounded-2xl">
            <Smartphone class="size-5" aria-hidden="true" />
          </span>
          <div class="flex-1">
            <h2 class="font-semibold">Уведомления на этом устройстве</h2>
            <p class="text-ink-soft text-sm">
              <template v-if="push.state.value === 'on'">Включены.</template>
              <template v-else-if="push.state.value === 'off'">Выключены.</template>
              <template v-else-if="push.state.value === 'denied'">
                Запрещены в настройках браузера. Разрешите уведомления для этого сайта и обновите страницу.
              </template>
              <template v-else-if="push.state.value === 'needs-install'">
                На iPhone уведомления работают только у приложения на экране «Домой»: нажмите «Поделиться» →
                «На экран „Домой“», откройте Школу Актива оттуда и включите здесь.
              </template>
              <template v-else-if="push.state.value === 'unsupported'">Этот браузер не умеет присылать уведомления.</template>
              <template v-else>Проверяем…</template>
            </p>
          </div>
        </div>
        <UiButton v-if="push.state.value === 'off'" @click="push.enable">
          <BellRing class="size-5" aria-hidden="true" /> Включить
        </UiButton>
        <UiButton v-else-if="push.state.value === 'on'" variant="ghost" @click="push.disable">Выключить на этом устройстве</UiButton>
        <UiNotice :message="push.message.value" />
      </section>

      <!-- По темам -->
      <section class="bg-card border-line overflow-hidden rounded-3xl border">
        <div class="text-ink-soft border-line grid grid-cols-[1fr_72px_72px] items-center border-b px-5 py-3 text-xs font-semibold uppercase">
          <span>Тема</span>
          <span class="text-center">Telegram</span>
          <span class="text-center">Пуш</span>
        </div>
        <div
          v-for="row in data?.rows ?? []"
          :key="row.category"
          class="border-line grid grid-cols-[1fr_72px_72px] items-center gap-2 border-b px-5 py-4 last:border-b-0"
        >
          <div>
            <p class="text-sm font-semibold">{{ row.label }}</p>
            <p class="text-ink-soft text-xs">{{ row.description }}</p>
          </div>
          <div v-for="channel in ['TELEGRAM', 'PUSH'] as const" :key="channel" class="flex justify-center">
            <button
              type="button"
              role="switch"
              :aria-checked="row.channels[channel]"
              :aria-label="`${row.label}: ${channel === 'TELEGRAM' ? 'Telegram' : 'пуш'}`"
              class="relative h-7 w-12 rounded-full transition"
              :class="row.channels[channel] ? 'bg-accent' : 'bg-line'"
              @click="toggle(row, channel)"
            >
              <span
                class="absolute top-1 left-1 size-5 rounded-full bg-white shadow transition"
                :class="row.channels[channel] ? 'translate-x-5' : ''"
              />
            </button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
