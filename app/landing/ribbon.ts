/**
 * Бесконечная лента «Люди Школы»: едет сама, а посетитель может её
 * перехватить — потянуть мышью или пальцем, прокрутить тачпадом или колесом
 * по горизонтали. Отпустил — лента катится по инерции и через 4 секунды
 * без касаний снова едет сама.
 *
 * Дорожка — несколько одинаковых копий списка; смещение заворачивается по
 * ширине одной копии, поэтому шва не видно. Двигается только transform
 * дорожки, кадры идут, лишь пока ленту видно.
 *
 * Чистые расчёты (заворот, порог перетаскивания, инерция, разгон) отдельно
 * — их проверяют тесты.
 */

/** Сколько ждать после касания, прежде чем лента снова поедет, мс. */
export const RESUME_AFTER = 4000;
/** За сколько лента разгоняется обратно до хода, мс. */
const RAMP = 1000;
/** Сдвиг указателя, после которого нажатие становится перетаскиванием, px. */
const DRAG_THRESHOLD = 6;

/** Смещение в пределах одной копии: [0, period). */
export function wrap(offset: number, period: number): number {
  if (period <= 0) return 0;
  return ((offset % period) + period) % period;
}

/** Нажатие или перетаскивание: горизонтальный сдвиг от порога и больше вертикального. */
export function isDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) >= DRAG_THRESHOLD && Math.abs(dx) > Math.abs(dy);
}

/** Инерция после броска: за секунду остаётся 4% скорости, медленнее 5 px/с — стоп. */
export function decay(velocity: number, seconds: number): number {
  const next = velocity * 0.04 ** seconds;
  return Math.abs(next) < 5 ? 0 : next;
}

/** Скорость хода через `idle` мс после последнего касания: стоит, потом плавно разгоняется. */
export function cruise(idle: number, speed: number): number {
  const t = Math.min(1, Math.max(0, (idle - RESUME_AFTER) / RAMP));
  return speed * t * t * (3 - 2 * t);
}

/** Сколько копий списка нужно, чтобы при любом смещении экран был закрыт. */
export function copiesNeeded(period: number, viewport: number): number {
  if (period <= 0 || viewport <= 0) return 2;
  return Math.max(2, Math.ceil(viewport / period) + 1);
}

export interface Ribbon {
  /** Ширина копии или экрана поменялась. */
  refresh(): void;
  /** Посетитель трогает что-то внутри (листает фото): лента стоит. */
  hold(): void;
  dispose(): void;
}

export function createRibbon(options: {
  viewport: HTMLElement;
  track: HTMLElement;
  /** Едет ли сама (нет — при «уменьшить движение»). */
  auto: boolean;
  /** Ход, px/с. */
  speed?: number;
}): Ribbon {
  const { viewport, track, auto } = options;
  const speed = options.speed ?? 40;

  let period = 0;
  let offset = 0;
  let velocity = 0;
  // Касались давно: лента сразу едет с полной скоростью.
  let touchedAt = -Infinity;
  let hovering = false;
  let focused = false;
  let visible = false;
  let frame = 0;
  let last = 0;

  const apply = () => {
    track.style.transform = `translate3d(${-offset}px, 0, 0)`;
  };
  const touch = () => {
    touchedAt = performance.now();
  };

  function tick(now: number) {
    const seconds = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!drag?.active) {
      if (velocity) {
        offset += velocity * seconds;
        velocity = decay(velocity, seconds);
      } else if (auto && !hovering && !focused) {
        offset += cruise(now - touchedAt, speed) * seconds;
      }
      offset = wrap(offset, period);
      apply();
    }
    frame = requestAnimationFrame(tick);
  }

  function run() {
    if (frame || !visible) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }
  function pause() {
    cancelAnimationFrame(frame);
    frame = 0;
  }

  // Перетаскивание: короткое касание остаётся нажатием (ссылки, кнопки
  // фото работают), сдвиг от порога — тянем ленту, клик после этого гасим.
  let drag: { id: number; x: number; y: number; from: number; lastX: number; lastT: number; active: boolean } | null = null;
  let swallowClick = false;

  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    touch();
    velocity = 0;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, from: offset, lastX: event.clientX, lastT: event.timeStamp, active: false };
  }
  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    if (!drag.active) {
      if (!isDrag(dx, event.clientY - drag.y)) return;
      drag.active = true;
      viewport.setPointerCapture(event.pointerId);
      viewport.dataset.dragging = "";
    }
    const dt = (event.timeStamp - drag.lastT) / 1000;
    if (dt > 0) velocity = 0.8 * (-(event.clientX - drag.lastX) / dt) + 0.2 * velocity;
    drag.lastX = event.clientX;
    drag.lastT = event.timeStamp;
    offset = wrap(drag.from - dx, period);
    apply();
    touch();
  }
  function up(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.id) return;
    if (drag.active) {
      swallowClick = true;
      delete viewport.dataset.dragging;
      // Отпустили, не двигая, — без броска.
      if (event.timeStamp - drag.lastT > 80) velocity = 0;
      velocity = Math.max(-3000, Math.min(3000, velocity));
    } else {
      velocity = 0;
    }
    drag = null;
    touch();
  }
  function click(event: MouseEvent) {
    if (!swallowClick) return;
    swallowClick = false;
    event.preventDefault();
    event.stopPropagation();
  }

  // Тачпад и колесо по горизонтали (или Shift + колесо). Вертикальную
  // прокрутку страницы не трогаем.
  function wheel(event: WheelEvent) {
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const delta = horizontal ? event.deltaX : event.shiftKey ? event.deltaY : 0;
    if (!delta) return;
    event.preventDefault();
    velocity = 0;
    offset = wrap(offset + delta, period);
    apply();
    touch();
  }

  function enter(event: PointerEvent) {
    if (event.pointerType === "mouse") hovering = true;
  }
  function leave(event: PointerEvent) {
    if (event.pointerType !== "mouse") return;
    hovering = false;
    touch();
  }

  // Tab на карточку за краем — подводим её в кадр (только с клавиатуры:
  // нажатие мышью на фото ленту не дёргает).
  function focusIn(event: FocusEvent) {
    focused = true;
    velocity = 0;
    const target = event.target as HTMLElement;
    if (!target.matches(":focus-visible")) return;
    const card = target.closest("li") ?? target;
    const box = card.getBoundingClientRect();
    const frameBox = viewport.getBoundingClientRect();
    const pad = 16;
    if (box.left < frameBox.left + pad) offset += box.left - frameBox.left - pad;
    else if (box.right > frameBox.right - pad) offset += box.right - frameBox.right + pad;
    offset = wrap(offset, period);
    apply();
  }
  function focusOut() {
    focused = false;
    touch();
  }

  const observer = new IntersectionObserver(([entry]) => {
    visible = Boolean(entry?.isIntersecting);
    if (visible) run();
    else pause();
  });
  observer.observe(viewport);

  viewport.addEventListener("pointerdown", down);
  viewport.addEventListener("pointermove", move);
  viewport.addEventListener("pointerup", up);
  viewport.addEventListener("pointercancel", up);
  viewport.addEventListener("click", click, true);
  viewport.addEventListener("wheel", wheel, { passive: false });
  viewport.addEventListener("pointerenter", enter);
  viewport.addEventListener("pointerleave", leave);
  viewport.addEventListener("focusin", focusIn);
  viewport.addEventListener("focusout", focusOut);

  function refresh() {
    period = (track.firstElementChild as HTMLElement | null)?.offsetWidth ?? 0;
    offset = wrap(offset, period);
    apply();
  }
  refresh();

  return {
    refresh,
    hold() {
      velocity = 0;
      touch();
    },
    dispose() {
      pause();
      observer.disconnect();
      viewport.removeEventListener("pointerdown", down);
      viewport.removeEventListener("pointermove", move);
      viewport.removeEventListener("pointerup", up);
      viewport.removeEventListener("pointercancel", up);
      viewport.removeEventListener("click", click, true);
      viewport.removeEventListener("wheel", wheel);
      viewport.removeEventListener("pointerenter", enter);
      viewport.removeEventListener("pointerleave", leave);
      viewport.removeEventListener("focusin", focusIn);
      viewport.removeEventListener("focusout", focusOut);
    },
  };
}
