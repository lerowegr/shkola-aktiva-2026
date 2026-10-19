<script setup lang="ts">
import { ArrowRight, BookOpen, Globe } from "lucide-vue-next";

import type { CurrentUser } from "~~/lib/auth/actor";
import { miniAppSitePath, miniAppTarget } from "~~/lib/auth/miniapp-entry";
import { stashInitData, telegramInitData } from "~/utils/telegram";

/**
 * Вход в Mini App.
 *
 * Бот открывает эту страницу; Telegram приписывает к адресу подпись,
 * по которой сервер узнаёт человека без пароля. Обычный вход показывает
 * выбор теста и сайта; кнопки бота и уведомлений открывают выбранный экран.
 */
useHead({ title: "Школа Актива" });

interface TelegramWebAppExtra {
  initDataUnsafe?: { user?: { allows_write_to_pm?: boolean } };
  requestWriteAccess?: (callback: (allowed: boolean) => void) => void;
}

const route = useRoute();

const message = ref<string | null>(null);
const outside = ref(false);
const ready = ref(false);
const pending = ref(false);
const user = useState<CurrentUser | null>("session", () => null);
const sitePath = computed(() => miniAppSitePath(user.value));
const siteLabel = computed(() =>
  user.value && !user.value.needsProfile
    ? "Открыть личный кабинет"
    : "Открыть сайт ША",
);

async function enter() {
  const initData = telegramInitData();

  if (!initData) {
    outside.value = true;
    return;
  }

  stashInitData(initData);
  pending.value = true;
  message.value = null;

  try {
    const result = await $fetch<{ ok: boolean; message?: string }>(
      "/api/auth/telegram-miniapp",
      {
        method: "POST",
        body: { initData },
        ignoreResponseError: true,
      },
    ).catch(() => ({
      ok: false,
      message: "Нет связи с сайтом. Проверьте интернет.",
    }));

    if (!result.ok) {
      message.value = result.message ?? "Не получилось войти.";
      return;
    }

    const currentUser = await refreshSession();
    if (!currentUser) {
      message.value =
        "Не получилось сохранить вход. Закройте приложение и откройте заново из бота.";
      return;
    }
    if (currentUser.mustChangePassword) {
      await navigateTo("/password", { replace: true });
      return;
    }

    // Бот может написать первым, только если человек разрешил. Без этого
    // ответы организаторов и новости отбора до него не дойдут.
    const webApp = (
      window as unknown as { Telegram?: { WebApp?: TelegramWebAppExtra } }
    ).Telegram?.WebApp;
    if (
      webApp?.initDataUnsafe?.user?.allows_write_to_pm === false &&
      webApp.requestWriteAccess
    ) {
      await new Promise<void>((resolve) =>
        webApp.requestWriteAccess!(() => resolve()),
      );
    }

    // Кнопка «Открыть» в сообщении бота ведёт сразу на нужный экран: /tg?to=/cabinet/messages.
    const target = miniAppTarget(
      route.query.screen,
      route.query.to,
      currentUser,
    );
    if (target) await navigateTo(target, { replace: true });
    else ready.value = true;
  } catch {
    message.value =
      "Нет связи с сайтом. Проверьте интернет и попробуйте ещё раз.";
  } finally {
    pending.value = false;
  }
}

onMounted(enter);
</script>

<template>
  <main
    class="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center"
  >
    <AppMark class="size-14 rounded-2xl text-lg" />

    <template v-if="outside">
      <p>Эта страница открывается из Telegram-бота.</p>
      <UiButton href="/login" variant="ghost">Войти на сайте</UiButton>
    </template>
    <template v-else-if="message">
      <UiNotice :message="message" />
      <UiButton :pending="pending" @click="enter">Попробовать ещё раз</UiButton>
    </template>
    <template v-else-if="ready">
      <div class="flex flex-col gap-2">
        <h1 class="font-display text-3xl">Школа Актива</h1>
        <p class="text-ink-soft">С чего начнём?</p>
      </div>
      <div class="flex w-full flex-col gap-3 text-left">
        <section
          class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5"
        >
          <BookOpen class="text-accent size-6" aria-hidden="true" />
          <h2 class="font-display text-xl">Тест про ША</h2>
          <p class="text-ink-soft text-sm">
            Узнай, насколько хорошо ты знаешь Школу Актива. В конце — твой
            результат и переход к регистрации на ША.
          </p>
          <UiButton href="/test"
            >Открыть тест
            <ArrowRight class="size-4 shrink-0" aria-hidden="true"
          /></UiButton>
        </section>
        <section
          class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5"
        >
          <Globe class="text-ink-soft size-6" aria-hidden="true" />
          <h2 class="font-display text-xl">Сайт и личный кабинет</h2>
          <p class="text-ink-soft text-sm">
            Узнай больше о ША, зарегистрируйся на отбор или продолжи заполнять
            анкету в своём кабинете.
          </p>
          <UiButton :href="sitePath" variant="ghost">{{ siteLabel }}</UiButton>
        </section>
      </div>
    </template>
    <p v-else class="text-ink-soft" aria-live="polite">Входим…</p>
  </main>
</template>
