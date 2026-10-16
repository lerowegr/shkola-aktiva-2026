<script setup lang="ts">
import { stashInitData, telegramInitData } from "~/utils/telegram";

/**
 * Вход в Mini App.
 *
 * Бот открывает эту страницу; Telegram приписывает к адресу подпись,
 * по которой сервер узнаёт человека без пароля. Дальше: ещё не
 * зарегистрировался (не прошёл знакомство) — главная сайта ША с кнопкой
 * «Зарегистрироваться»; зарегистрирован — личный кабинет, организатор —
 * кабинет организатора.
 */
useHead({ title: "Школа Актива" });

interface TelegramWebAppExtra {
  initDataUnsafe?: { user?: { allows_write_to_pm?: boolean } };
  requestWriteAccess?: (callback: (allowed: boolean) => void) => void;
}

const route = useRoute();

const message = ref<string | null>(null);
const outside = ref(false);

onMounted(async () => {
  const initData = telegramInitData();

  if (!initData) {
    outside.value = true;
    return;
  }

  stashInitData(initData);

  const result = await $fetch<{ ok: boolean; message?: string }>("/api/auth/telegram-miniapp", {
    method: "POST",
    body: { initData },
    ignoreResponseError: true,
  }).catch(() => ({ ok: false, message: "Нет связи с сайтом. Проверьте интернет." }));

  if (!result.ok) {
    message.value = result.message ?? "Не получилось войти.";
    return;
  }

  const user = await refreshSession();

  // Бот может написать первым, только если человек разрешил. Без этого
  // ответы организаторов и новости отбора до него не дойдут.
  const webApp = (window as unknown as { Telegram?: { WebApp?: TelegramWebAppExtra } }).Telegram?.WebApp;
  if (webApp?.initDataUnsafe?.user?.allows_write_to_pm === false && webApp.requestWriteAccess) {
    await new Promise<void>((resolve) => webApp.requestWriteAccess!(() => resolve()));
  }

  // Кнопка «Открыть» в сообщении бота ведёт сразу на нужный экран: /tg?to=/cabinet/messages.
  const to = typeof route.query.to === "string" && route.query.to.startsWith("/") && !route.query.to.startsWith("//") ? route.query.to : null;
  const home = user?.needsProfile ? "/" : homeFor(user);
  await navigateTo(to ?? home, { replace: true });
});
</script>

<template>
  <main class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
    <AppMark class="size-14 rounded-2xl text-lg" />

    <template v-if="outside">
      <p>Эта страница открывается из Telegram-бота.</p>
      <UiButton href="/login" variant="ghost">Войти на сайте</UiButton>
    </template>
    <UiNotice v-else-if="message" :message="message" />
    <p v-else class="text-ink-soft" aria-live="polite">Входим…</p>
  </main>
</template>
