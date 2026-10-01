/**
 * Пуши на этом устройстве: можно ли, включены ли, включить, выключить.
 *
 * Подписка — дело браузера: он спрашивает разрешение, создаёт подписку у
 * своего сервиса пушей (у Chrome — Google, у Safari — Apple) и отдаёт нам
 * адрес, на который наш сервер будет слать. Без service worker не бывает
 * ни разрешения, ни подписки.
 *
 * Айфон: пуши есть только у сайта, добавленного на экран «Домой»
 * (iOS 16.4+). В обычном Safari PushManager просто отсутствует — поэтому
 * отдельное состояние «нужно установить».
 */
export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on" | "loading";

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function usePush() {
  const config = useRuntimeConfig();
  const publicKey = String(config.public.vapidPublicKey ?? "");
  const state = ref<PushState>("loading");
  const message = ref<string | null>(null);

  async function registration() {
    if (!("serviceWorker" in navigator)) return null;
    return (await navigator.serviceWorker.getRegistration()) ?? null;
  }

  async function detect() {
    if (!publicKey) return (state.value = "unsupported");
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      return (state.value = isIos() && !isStandalone() ? "needs-install" : "unsupported");
    }
    if (Notification.permission === "denied") return (state.value = "denied");
    const reg = await registration();
    const subscription = await reg?.pushManager.getSubscription();
    state.value = subscription ? "on" : "off";
  }

  async function enable() {
    message.value = null;
    const reg = await registration();
    if (!reg) {
      message.value = "Приложение ещё загружается. Обновите страницу и попробуйте снова.";
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      state.value = permission === "denied" ? "denied" : "off";
      return;
    }

    try {
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64ToBytes(publicKey),
      });
      const json = subscription.toJSON();
      await $fetch("/api/push/subscribe", {
        method: "POST",
        body: { endpoint: json.endpoint, keys: json.keys },
      });
      state.value = "on";
    } catch {
      message.value = "Не получилось включить уведомления. Попробуйте ещё раз или в другом браузере.";
    }
  }

  async function disable() {
    const reg = await registration();
    const subscription = await reg?.pushManager.getSubscription();
    if (subscription) {
      await $fetch("/api/push/unsubscribe", { method: "POST", body: { endpoint: subscription.endpoint } }).catch(() => null);
      await subscription.unsubscribe();
    }
    state.value = "off";
  }

  onMounted(detect);

  return { state, message, enable, disable };
}
