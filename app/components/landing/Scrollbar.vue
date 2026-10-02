<script setup lang="ts">
import { prefersReducedMotion } from "~/landing/motion";

/**
 * Своя полоса прокрутки главной: тонкая линия справа, по ней едет маскот и
 * смотрит, куда листают. Появляется при прокрутке и когда мышь у правого
 * края, прячется через секунду покоя.
 *
 * Прокрутка остаётся браузерной: колесо, тачпад, клавиши и якоря работают
 * как обычно. Полоса только показывает место и двигает страницу, когда
 * маскота тянут мышью или нажимают на линию. На сенсорных экранах она лишь
 * показывает: касания проходят насквозь. Для экранного диктора её нет —
 * прокрутка доступна обычными средствами.
 *
 * Маскоту с линией нужно ~40 px справа. Содержимое шириной 72rem оставляет
 * их только от 1248 px; уже — у края лишь поле 16 px, и маскот заезжал бы на
 * кнопки. Там вместо него тонкая полоска у самого края.
 */
const rail = ref<HTMLElement | null>(null);
const thumb = ref<HTMLElement | null>(null);

const enabled = ref(false);
const visible = ref(false);
const dragging = ref(false);
const hovering = ref(false);
const progress = ref(0);
const gaze = ref<{ x: number; y: number } | null>(null);
const travel = ref(0);

let direction = 1;
let lastY = 0;
let frame = 0;
let hideTimer: ReturnType<typeof setTimeout> | null = null;

const maxScroll = () => document.documentElement.scrollHeight - window.innerHeight;

function measure() {
  const max = maxScroll();
  enabled.value = max > 8;
  progress.value = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  travel.value = (rail.value?.clientHeight ?? 0) - (thumb.value?.offsetHeight ?? 0);
  if (window.scrollY !== lastY) direction = window.scrollY > lastY ? 1 : -1;
  lastY = window.scrollY;
  // Маскот смотрит вдоль страницы в сторону прокрутки.
  const box = thumb.value?.getBoundingClientRect();
  if (box) gaze.value = { x: box.left - 60, y: box.top + box.height / 2 + direction * 160 };
}

function show() {
  visible.value = true;
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!dragging.value && !hovering.value) visible.value = false;
  }, 1200);
}

function onScroll() {
  if (frame) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    measure();
    if (enabled.value) show();
  });
}

// Мышь у правого края — показать, как системная полоса на маке.
function onMouseMove(event: MouseEvent) {
  if (enabled.value && event.clientX > window.innerWidth - 28) show();
}

function scrollToRatio(ratio: number, smooth: boolean) {
  const top = Math.min(1, Math.max(0, ratio)) * maxScroll();
  window.scrollTo({ top, behavior: smooth && !prefersReducedMotion() ? "smooth" : "instant" });
}

let grab = 0;
function down(event: PointerEvent) {
  if (event.button !== 0 || !thumb.value) return;
  event.preventDefault();
  event.stopPropagation();
  thumb.value.setPointerCapture(event.pointerId);
  grab = event.clientY - thumb.value.getBoundingClientRect().top;
  dragging.value = true;
}
function move(event: PointerEvent) {
  if (!dragging.value || !rail.value || travel.value <= 0) return;
  const top = rail.value.getBoundingClientRect().top;
  scrollToRatio((event.clientY - grab - top) / travel.value, false);
}
function up() {
  dragging.value = false;
  show();
}

// Нажатие на линию — переход к этому месту страницы.
function jump(event: MouseEvent) {
  if (!rail.value || travel.value <= 0) return;
  const half = (thumb.value?.offsetHeight ?? 0) / 2;
  scrollToRatio((event.clientY - rail.value.getBoundingClientRect().top - half) / travel.value, true);
}

function enter() {
  hovering.value = true;
  show();
}
function leave() {
  hovering.value = false;
  show();
}

let resize: ResizeObserver | null = null;
onMounted(() => {
  measure();
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("mousemove", onMouseMove, { passive: true });
  // Страница растёт, когда грузятся фото и раскрывается история.
  resize = new ResizeObserver(() => onScroll());
  resize.observe(document.body);
});
onBeforeUnmount(() => {
  window.removeEventListener("scroll", onScroll);
  window.removeEventListener("mousemove", onMouseMove);
  resize?.disconnect();
  cancelAnimationFrame(frame);
  if (hideTimer) clearTimeout(hideTimer);
});
</script>

<template>
  <div
    v-show="enabled"
    ref="rail"
    class="scrollbar fixed top-20 right-0.5 bottom-3 z-30 w-2.5 min-[1248px]:right-1 min-[1248px]:w-8"
    :class="{ 'is-visible': visible || dragging }"
    aria-hidden="true"
    @click="jump"
    @mouseenter="enter"
    @mouseleave="leave"
  >
    <span class="bg-ink/15 absolute inset-y-0 left-1/2 hidden w-0.5 -translate-x-1/2 rounded-full min-[1248px]:block" />
    <div
      ref="thumb"
      class="thumb absolute top-0 left-0 w-full cursor-grab touch-none"
      :class="{ 'cursor-grabbing': dragging }"
      :style="{ transform: `translateY(${progress * travel}px)` }"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
      @click.stop
    >
      <LandingMascot name="blue-a" :target="gaze" class="hidden! min-[1248px]:inline-block!" />
      <span class="bg-ink/40 mx-auto block h-10 w-1 rounded-full min-[1248px]:hidden" />
    </div>
  </div>
</template>

<style scoped>
.scrollbar {
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s;
}
.scrollbar.is-visible {
  opacity: 1;
}
/* Мышью полосу можно трогать, пока она видна; пальцем — никогда. */
@media (pointer: fine) {
  .scrollbar.is-visible {
    pointer-events: auto;
    cursor: pointer;
  }
}
@media (prefers-reduced-motion: reduce) {
  .scrollbar {
    transition: none;
  }
}
</style>
