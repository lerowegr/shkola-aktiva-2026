<script setup lang="ts">
import { Plus } from "lucide-vue-next";

import { motion, prefersReducedMotion } from "~/landing/motion";
import type { SiteContent } from "~~/lib/site/content";

/**
 * «Частые вопросы»: открыт один ответ за раз, ответ плавно раскрывается и
 * сворачивается, вопросы появляются по очереди при прокрутке. Слева
 * заголовок держится на месте. Основа — нативный <details>: работает с
 * клавиатуры и экранным диктором; анимацию высоты делает Web Animations.
 */
defineProps<{ faq: SiteContent["faq"] }>();

const list = ref<HTMLElement | null>(null);

function animate(details: HTMLDetailsElement, open: boolean) {
  const answer = details.querySelector<HTMLElement>(".answer")!;
  const duration = prefersReducedMotion() ? 0 : open ? 300 : 220;
  if (open) {
    details.open = true;
    answer.animate([{ height: "0px", opacity: 0 }, { height: `${answer.scrollHeight}px`, opacity: 1 }], {
      duration,
      easing: "cubic-bezier(0.3, 0.7, 0.4, 1)",
    });
  } else {
    const closing = answer.animate([{ height: `${answer.scrollHeight}px`, opacity: 1 }, { height: "0px", opacity: 0 }], {
      duration,
      easing: "ease-in",
    });
    closing.onfinish = () => (details.open = false);
  }
}

function toggle(event: Event) {
  event.preventDefault();
  const details = (event.currentTarget as HTMLElement).closest("details")!;
  const opening = !details.open;
  for (const other of list.value?.querySelectorAll("details") ?? []) {
    if (other !== details && other.open) animate(other, false);
  }
  animate(details, opening);
}

const section = ref<HTMLElement | null>(null);
let cleanup = () => {};
onMounted(async () => {
  cleanup = await motion(section.value!, ({ gsap }) => {
    gsap.from(".faq-item", {
      y: 28,
      opacity: 0,
      duration: 0.6,
      stagger: 0.07,
      ease: "power3.out",
      scrollTrigger: { trigger: list.value!, start: "top 85%" },
    });
  });
});
onBeforeUnmount(() => cleanup());
</script>

<template>
  <section
    id="voprosy"
    ref="section"
    class="mx-auto grid max-w-6xl scroll-mt-20 gap-10 px-4 py-24 sm:py-32 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.7fr)]"
  >
    <div class="flex flex-col gap-4 self-start lg:sticky lg:top-24">
      <h2 class="font-display text-4xl sm:text-5xl">{{ faq.title }}</h2>
      <p class="text-ink-soft text-lg">Не нашёл ответ? Напиши организаторам в разделе «Сообщения» в кабинете.</p>
      <img src="/brand/mascots/blue-b.webp" alt="" class="mt-4 hidden w-40 lg:block" loading="lazy">
    </div>
    <div ref="list" class="border-ink/10 divide-ink/10 divide-y border-y">
      <details v-for="(item, index) in faq.items" :key="index" class="faq-item group py-5" :open="index === 0">
        <summary
          class="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold sm:text-xl"
          @click="toggle"
        >
          {{ item.question }}
          <span
            class="border-ink/15 group-open:bg-ink group-open:text-paper grid size-9 shrink-0 place-items-center rounded-full border transition-colors"
          >
            <Plus class="size-5 transition-transform duration-300 group-open:rotate-45" aria-hidden="true" />
          </span>
        </summary>
        <div class="answer overflow-hidden">
          <p class="text-ink-soft max-w-[62ch] pt-3 text-lg">{{ item.answer }}</p>
        </div>
      </details>
    </div>
  </section>
</template>

<style scoped>
summary::-webkit-details-marker {
  display: none;
}
</style>
