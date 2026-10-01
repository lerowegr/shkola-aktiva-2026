<script setup lang="ts">
import type { SiteContent } from "~~/lib/site/content";

/**
 * «Люди Школы» — отдельное тёмное пространство: лента карточек людей с
 * фото, именем и ролью. Лента едет сама и замирает, когда на неё наводят,
 * фокусируются внутри или касаются; пока листают фото — тоже стоит.
 * Людей мало — ленты нет, просто ряд. «Уменьшить движение» — ряд с
 * прокруткой.
 */
const props = defineProps<{ people: SiteContent["people"] }>();

const MASCOTS = [
  { tone: "bg-brand-yellow-soft", mascot: "yellow-b" },
  { tone: "bg-brand-blue-soft", mascot: "blue-a" },
  { tone: "bg-brand-orange-soft", mascot: "orange" },
  { tone: "bg-brand-purple-soft", mascot: "purple" },
  { tone: "bg-brand-green-soft", mascot: "green" },
  { tone: "bg-brand-red-soft", mascot: "orange-angry" },
];

// Лента — когда людей хватает, чтобы она не повторялась на глазах.
const moving = computed(() => props.people.items.length >= 5);
const duration = computed(() => `${props.people.items.length * 7}s`);

const held = ref(false);
let release: ReturnType<typeof setTimeout> | null = null;
function hold(seconds = 6) {
  held.value = true;
  if (release) clearTimeout(release);
  release = setTimeout(() => (held.value = false), seconds * 1000);
}
onBeforeUnmount(() => {
  if (release) clearTimeout(release);
});
</script>

<template>
  <section id="lyudi" class="bg-ink text-paper relative isolate scroll-mt-20 overflow-hidden py-24 sm:py-32">
    <img src="/brand/textures/tiles.webp" alt="" class="absolute inset-0 -z-10 size-full object-cover opacity-25" loading="lazy">
    <div class="mx-auto max-w-6xl px-4">
      <h2 class="font-display text-4xl sm:text-6xl">{{ people.title }}</h2>
    </div>

    <div
      class="ribbon mt-12"
      :class="moving ? 'is-moving' : 'is-static'"
      :data-held="held || undefined"
      @pointerdown="hold()"
    >
      <div class="track flex w-max" :style="{ '--duration': duration }">
        <ul v-for="copy in moving ? 2 : 1" :key="copy" class="flex gap-4 pr-4" :aria-hidden="copy === 2 || undefined" :inert="copy === 2 || undefined">
          <li
            v-for="(person, index) in people.items"
            :key="index"
            class="border-paper/10 w-60 shrink-0 overflow-hidden rounded-3xl border bg-[#2f2f2f] sm:w-72"
          >
            <div class="aspect-[4/5]">
              <LandingPhotoSlider
                v-if="person.photos.length"
                :photos="person.photos"
                :label="`Фото: ${person.name}`"
                sizes="(min-width: 640px) 288px, 240px"
                dark
                @interact="hold()"
              />
              <div v-else class="grid size-full place-items-center" :class="MASCOTS[index % MASCOTS.length]!.tone">
                <img :src="`/brand/mascots/${MASCOTS[index % MASCOTS.length]!.mascot}.webp`" alt="" class="w-3/5" loading="lazy">
              </div>
            </div>
            <div class="flex flex-col gap-1 p-5">
              <p class="font-display text-xl leading-tight">{{ person.name }}</p>
              <p v-if="person.role" class="text-paper/70 text-sm">{{ person.role }}</p>
            </div>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Без движения — обычный ряд с прокруткой и привязкой к карточкам. */
.ribbon {
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  padding-inline: max(1rem, calc((100% - 72rem) / 2 + 1rem));
}
.ribbon::-webkit-scrollbar {
  display: none;
}
.ribbon li {
  scroll-snap-align: start;
}

@media (prefers-reduced-motion: no-preference) {
  .ribbon.is-moving {
    overflow: hidden;
    padding-inline: 0;
  }
  .ribbon.is-moving .track {
    animation: ribbon var(--duration) linear infinite;
  }
  .ribbon.is-moving:hover .track,
  .ribbon.is-moving:focus-within .track,
  .ribbon.is-moving[data-held] .track {
    animation-play-state: paused;
  }
}

@keyframes ribbon {
  to {
    transform: translateX(-50%);
  }
}
</style>
