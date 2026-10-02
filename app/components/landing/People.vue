<script setup lang="ts">
import { prefersReducedMotion } from "~/landing/motion";
import { copiesNeeded, createRibbon, type Ribbon } from "~/landing/ribbon";
import type { SiteContent } from "~~/lib/site/content";

/**
 * «Люди Школы» — отдельное тёмное пространство: лента карточек людей с
 * фото, именем и ролью. Лента едет сама; её можно потянуть мышью или
 * пальцем и прокрутить тачпадом — бесконечно в обе стороны. Отпустили — через
 * несколько секунд снова едет. Наведение мышью и листание фото её держат.
 *
 * Людей меньше пяти — ленты нет, обычный ряд с прокруткой. «Уменьшить
 * движение» — лента не едет сама, но листается.
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
// Копий столько, чтобы закрыть экран при любом сдвиге; на сервере — две.
const copies = ref(2);

const viewport = ref<HTMLElement | null>(null);
const track = ref<HTMLElement | null>(null);
let ribbon: Ribbon | null = null;
// Листают фото — лента стоит.
const hold = () => ribbon?.hold();

async function measure() {
  const first = track.value?.firstElementChild as HTMLElement | null;
  copies.value = copiesNeeded(first?.offsetWidth ?? 0, viewport.value?.clientWidth ?? 0);
  await nextTick();
  ribbon?.refresh();
}

let resize: ResizeObserver | null = null;
onMounted(async () => {
  if (!moving.value || !viewport.value || !track.value) return;
  ribbon = createRibbon({ viewport: viewport.value, track: track.value, auto: !prefersReducedMotion() });
  await measure();
  resize = new ResizeObserver(() => void measure());
  resize.observe(viewport.value);
});
onBeforeUnmount(() => {
  resize?.disconnect();
  ribbon?.dispose();
});
</script>

<template>
  <section id="lyudi" class="bg-ink text-paper relative isolate scroll-mt-20 overflow-hidden py-24 sm:py-32">
    <img src="/brand/textures/tiles.webp" alt="" class="absolute inset-0 -z-10 size-full object-cover opacity-25" loading="lazy">
    <div class="mx-auto max-w-6xl px-4">
      <h2 class="font-display text-4xl sm:text-6xl">{{ people.title }}</h2>
      <p v-if="moving" class="text-paper/60 mt-3">Потяни ленту, чтобы найти своих.</p>
    </div>

    <div ref="viewport" class="ribbon mt-12" :class="moving ? 'is-moving' : 'is-static'" @dragstart.prevent>
      <div ref="track" class="track flex w-max">
        <ul
          v-for="copy in moving ? copies : 1"
          :key="copy"
          class="flex gap-4 pr-4"
          :aria-hidden="copy > 1 || undefined"
          :inert="copy > 1 || undefined"
        >
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
                @interact="hold"
              />
              <div v-else class="grid size-full place-items-center" :class="MASCOTS[index % MASCOTS.length]!.tone">
                <img
                  :src="`/brand/mascots/${MASCOTS[index % MASCOTS.length]!.mascot}.webp`"
                  alt=""
                  class="w-3/5"
                  loading="lazy"
                  draggable="false"
                >
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
/* Людей мало — обычный ряд с прокруткой и привязкой к карточкам. */
.ribbon.is-static {
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  padding-inline: max(1rem, calc((100% - 72rem) / 2 + 1rem));
}
.ribbon.is-static::-webkit-scrollbar {
  display: none;
}
.ribbon.is-static li {
  scroll-snap-align: start;
}

/* Лента: вертикальный жест пальцем — странице, горизонтальный — ленте. */
.ribbon.is-moving {
  overflow: hidden;
  touch-action: pan-y;
  cursor: grab;
  user-select: none;
  -webkit-user-select: none;
}
.ribbon.is-moving[data-dragging] {
  cursor: grabbing;
}
.track {
  will-change: transform;
}
</style>
