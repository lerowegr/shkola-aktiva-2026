<script setup lang="ts">
import { ChevronLeft, ChevronRight } from "lucide-vue-next";

import type { PhotoRef } from "~~/lib/site/content";

/**
 * Фото по одному: свайп, стрелки, клавиатура, счётчик. Браузер сам берёт
 * вариант под экран (480/960/1600), фото грузятся, только когда до них
 * дошли. Одно фото — без управления.
 *
 * Событие `interact` — для ленты людей: пока листают фото, лента стоит.
 */
const props = defineProps<{
  photos: PhotoRef[];
  sizes: string;
  /** Подпись слайдера для экранного диктора: «Фото: Аня». */
  label: string;
  dark?: boolean;
}>();
const emit = defineEmits<{ interact: [] }>();

const index = ref(0);
const many = computed(() => props.photos.length > 1);

function go(step: number) {
  emit("interact");
  index.value = (index.value + step + props.photos.length) % props.photos.length;
}

const src = (id: string, width: number) => `/media/site/${id}/${width}.webp`;

// Свайп: горизонтальный жест листает, вертикальный оставляем странице.
let start: { x: number; y: number } | null = null;
function down(event: PointerEvent) {
  emit("interact");
  start = { x: event.clientX, y: event.clientY };
}
function up(event: PointerEvent) {
  if (!start || !many.value) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  start = null;
  if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
}

function key(event: KeyboardEvent) {
  if (!many.value || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
  event.preventDefault();
  go(event.key === "ArrowLeft" ? -1 : 1);
}
</script>

<template>
  <div
    class="group relative size-full touch-pan-y overflow-hidden outline-none select-none focus-visible:ring-4"
    :class="dark ? 'focus-visible:ring-paper/60' : 'focus-visible:ring-accent/40'"
    role="region"
    aria-roledescription="слайдер"
    :aria-label="label"
    :tabindex="many ? 0 : undefined"
    @pointerdown="down"
    @pointerup="up"
    @keydown="key"
  >
    <div class="track flex size-full" :style="{ transform: `translateX(-${index * 100}%)` }">
      <img
        v-for="(photo, at) in photos"
        :key="photo.id"
        :src="src(photo.id, 960)"
        :srcset="`${src(photo.id, 480)} 480w, ${src(photo.id, 960)} 960w, ${src(photo.id, 1600)} 1600w`"
        :sizes="sizes"
        :alt="photo.alt"
        :aria-hidden="at !== index || undefined"
        class="size-full shrink-0 object-cover"
        loading="lazy"
        decoding="async"
        draggable="false"
      >
    </div>

    <template v-if="many">
      <button
        type="button"
        class="bg-ink/55 text-paper absolute top-1/2 left-2 grid size-9 -translate-y-1/2 place-items-center rounded-full backdrop-blur transition hover:bg-ink/75"
        aria-label="Предыдущее фото"
        @click.stop="go(-1)"
      >
        <ChevronLeft class="size-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="bg-ink/55 text-paper absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-full backdrop-blur transition hover:bg-ink/75"
        aria-label="Следующее фото"
        @click.stop="go(1)"
      >
        <ChevronRight class="size-5" aria-hidden="true" />
      </button>
      <span class="bg-ink/55 text-paper absolute bottom-2 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-2 py-1 backdrop-blur" aria-hidden="true">
        <span
          v-for="(photo, at) in photos"
          :key="photo.id"
          class="size-1.5 rounded-full transition"
          :class="at === index ? 'bg-paper' : 'bg-paper/40'"
        />
      </span>
      <span class="sr-only" aria-live="polite">Фото {{ index + 1 }} из {{ photos.length }}</span>
    </template>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .track {
    transition: transform 0.35s cubic-bezier(0.3, 0.7, 0.4, 1);
  }
}
</style>
