/**
 * Вход через Telegram по коду.
 *
 * Код берём заранее, как только кнопка появилась на экране: тогда кнопка —
 * обычная ссылка на бота, и браузер не принимает её за всплывающее окно.
 * Если бы код запрашивался по нажатию, ссылка открывалась бы после
 * ожидания ответа, и мобильные браузеры такое окно блокируют.
 *
 * После нажатия страница раз в две секунды спрашивает, подтвердил ли бот
 * код, и, дождавшись, заводит сессию.
 */
export function useTelegramLogin(onSignedIn: () => Promise<void>) {
  const config = useRuntimeConfig();
  const bot = String(config.public.telegramBotUsername ?? "").replace(/^@/, "");

  const available = bot.length > 0;
  const link = ref<string | null>(null);
  const waiting = ref(false);
  const message = ref<string | null>(null);

  let code: string | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let expiry: ReturnType<typeof setTimeout> | null = null;

  function stop() {
    if (timer) clearInterval(timer);
    if (expiry) clearTimeout(expiry);
    timer = null;
    expiry = null;
  }

  async function prepare() {
    if (!available) return;
    stop();
    waiting.value = false;

    try {
      const response = await $fetch<{ code: string; expiresIn: number }>("/api/auth/telegram-code", {
        method: "POST",
      });
      code = response.code;
      link.value = `https://t.me/${bot}?start=login_${code}`;
      // Код скоро протухнет — возьмём свежий, чтобы кнопка не вела в никуда.
      expiry = setTimeout(prepare, (response.expiresIn - 15) * 1000);
    } catch {
      message.value = "Не получилось подготовить вход через Telegram. Обновите страницу.";
    }
  }

  async function check() {
    if (!code) return;

    const status = await $fetch<{ done: boolean; expired: boolean }>("/api/auth/telegram-status", {
      query: { code },
    }).catch(() => null);

    if (!status) return;

    if (status.expired) {
      message.value = "Ссылка устарела. Нажмите кнопку ещё раз.";
      await prepare();
      return;
    }

    if (!status.done) return;

    stop();
    const result = await $fetch<{ ok: boolean; message?: string }>("/api/auth/telegram-login", {
      method: "POST",
      body: { code },
      ignoreResponseError: true,
    });

    if (result.ok) {
      await onSignedIn();
    } else {
      message.value = result.message ?? "Не получилось войти. Попробуйте ещё раз.";
      await prepare();
    }
  }

  function started() {
    message.value = null;
    waiting.value = true;
    if (!timer) timer = setInterval(check, 2000);
  }

  onMounted(prepare);
  onBeforeUnmount(stop);

  return { available, link, waiting, message, started };
}
