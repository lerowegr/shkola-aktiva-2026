/**
 * Сайт внутри Telegram.
 *
 * Telegram открывает Mini App обычной страницей, дописывая к адресу
 * подпись: `#tgWebAppData=...`. По ней и узнаём, что мы внутри, — до
 * того как грузить чужой скрипт. Грузить его всем подряд незачем: это
 * сторонний скрипт, и тем, кто заходит из браузера, он не нужен.
 *
 * Подпись переживает переходы по страницам в sessionStorage. Адресная
 * строка её теряет на первом же переходе, а нужна она может быть позже —
 * например, когда сессия истекла и человека надо впустить заново, не
 * выгоняя из Telegram.
 */
const STASH = "sha:tg-init-data";

export interface TelegramWebApp {
  initData: string;
  ready: () => void;
  expand: () => void;
  close: () => void;
  colorScheme?: "light" | "dark";
  HapticFeedback?: {
    impactOccurred: (style: "light" | "medium" | "heavy" | "rigid" | "soft") => void;
    notificationOccurred: (type: "error" | "success" | "warning") => void;
  };
}

function global(): { Telegram?: { WebApp?: TelegramWebApp } } {
  return window as unknown as { Telegram?: { WebApp?: TelegramWebApp } };
}

/** Мы внутри Telegram? Ответ нужен до загрузки его скрипта. */
export function inTelegram(): boolean {
  if (typeof window === "undefined") return false;
  if (global().Telegram?.WebApp?.initData) return true;
  if (window.location.hash.includes("tgWebAppData")) return true;

  try {
    return sessionStorage.getItem(STASH) !== null;
  } catch {
    return false;
  }
}

/** Подписанная строка Telegram — из скрипта, из адреса или из запаса. */
export function telegramInitData(): string | null {
  if (typeof window === "undefined") return null;

  const fromSdk = global().Telegram?.WebApp?.initData;
  if (fromSdk) return fromSdk;

  // Скрипт мог ещё не загрузиться — разберём адрес сами.
  const hash = window.location.hash.replace(/^#/, "");
  const fromHash = new URLSearchParams(hash).get("tgWebAppData");
  if (fromHash) return fromHash;

  try {
    return sessionStorage.getItem(STASH);
  } catch {
    return null;
  }
}

export function stashInitData(value: string): void {
  try {
    sessionStorage.setItem(STASH, value);
  } catch {
    // Приватный режим: обойдёмся без запаса.
  }
}

/** Подключает скрипт Telegram. Второй вызов ничего не делает. */
export function loadTelegramSdk(): Promise<TelegramWebApp | null> {
  const existing = global().Telegram?.WebApp;
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.async = true;
    script.onload = () => resolve(global().Telegram?.WebApp ?? null);
    // Не достучались до Telegram — сайт должен открыться всё равно,
    // просто без полноэкранного режима.
    script.onerror = () => resolve(null);
    document.head.appendChild(script);
  });
}

/**
 * Вибрация отклика — только внутри Telegram, где она штатная и ожидаемая.
 * В браузере молчим: navigator.vibrate на сайте раздражает.
 */
export function haptic(kind: "tap" | "success" | "error"): void {
  if (typeof window === "undefined") return;
  const feedback = global().Telegram?.WebApp?.HapticFeedback;
  if (!feedback) return;
  if (kind === "tap") feedback.impactOccurred("light");
  else feedback.notificationOccurred(kind);
}
