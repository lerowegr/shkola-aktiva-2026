import type { ActionResult } from "~/composables/useAction";

/**
 * Автосохранение полей формы.
 *
 * Каждое поле сохраняется само через паузу после последнего нажатия.
 * Запросы одного поля идут строго по очереди: иначе медленный старый
 * запрос мог бы прийти на сервер после быстрого нового и затереть свежий
 * текст устаревшим.
 *
 * Пока что-то не сохранено, закрыть вкладку без предупреждения нельзя.
 */
export function useAutosave(delay = 700) {
  const state = ref<"idle" | "saving" | "saved" | "error">("idle");
  const savedAt = ref<Date | null>(null);
  const error = ref<string | null>(null);

  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const waiting = new Map<string, () => Promise<ActionResult>>();
  const chains = new Map<string, Promise<unknown>>();
  let inFlight = 0;

  function busy() {
    return waiting.size > 0 || inFlight > 0;
  }

  async function send(key: string): Promise<void> {
    const run = waiting.get(key);
    if (!run) return;
    waiting.delete(key);
    clearTimeout(timers.get(key));
    timers.delete(key);

    const previous = chains.get(key) ?? Promise.resolve();
    const next = previous.then(async () => {
      inFlight++;
      state.value = "saving";
      try {
        const result = await run();
        if (!result.ok) {
          state.value = "error";
          error.value = result.message ?? "Не сохранилось. Проверьте интернет.";
        } else if (waiting.size === 0 && inFlight === 1) {
          // Последний из очереди — всё сохранено.
          error.value = null;
          savedAt.value = new Date();
          state.value = "saved";
        }
      } finally {
        inFlight--;
      }
    });

    chains.set(key, next);
    await next;
  }

  function schedule(key: string, run: () => Promise<ActionResult>) {
    waiting.set(key, run);
    clearTimeout(timers.get(key));
    timers.set(key, setTimeout(() => void send(key), delay));
  }

  /** Сохранить всё отложенное прямо сейчас — перед отправкой формы. */
  async function flush() {
    await Promise.all([...waiting.keys()].map((key) => send(key)));
    await Promise.all(chains.values());
  }

  function warn(event: BeforeUnloadEvent) {
    if (!busy()) return;
    event.preventDefault();
  }

  onMounted(() => window.addEventListener("beforeunload", warn));
  onBeforeUnmount(() => {
    window.removeEventListener("beforeunload", warn);
    void flush();
  });

  return { state, savedAt, error, schedule, flush };
}
