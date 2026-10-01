/**
 * Секундомер партии: идёт с первого хода, на табло обновляется несколько
 * раз в секунду. Итоговое время — точное, по performance.now().
 */
export function useStopwatch() {
  const elapsed = ref(0);
  let started = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function start() {
    if (timer) return;
    started = performance.now() - elapsed.value;
    timer = setInterval(() => (elapsed.value = performance.now() - started), 250);
  }

  function stop(): number {
    if (timer) clearInterval(timer);
    timer = null;
    elapsed.value = Math.round(performance.now() - started);
    return elapsed.value;
  }

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
  });

  return { elapsed, start, stop, running: () => timer !== null };
}
