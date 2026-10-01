/**
 * GSAP и ScrollTrigger для лендинга — грузятся, только когда главная уже
 * в браузере, и не попадают в кабинеты.
 *
 * Каждый раздел заводит свою анимацию через motion(), а при уходе со
 * страницы вызывает возвращённую уборку. При «уменьшить движение» функция
 * не вызывается вовсе: страница остаётся неподвижной и целиком читаемой.
 */
type Gsap = typeof import("gsap").gsap;
type Trigger = typeof import("gsap/ScrollTrigger").ScrollTrigger;

let loading: Promise<{ gsap: Gsap; ScrollTrigger: Trigger }> | null = null;

function load() {
  loading ??= Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([core, plugin]) => {
    core.gsap.registerPlugin(plugin.ScrollTrigger);
    return { gsap: core.gsap, ScrollTrigger: plugin.ScrollTrigger };
  });
  return loading;
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export async function motion(
  scope: Element,
  setup: (tools: { gsap: Gsap; ScrollTrigger: Trigger }) => void,
): Promise<() => void> {
  if (prefersReducedMotion()) return () => {};
  const tools = await load();
  const context = tools.gsap.context(() => setup(tools), scope);
  return () => context.revert();
}
