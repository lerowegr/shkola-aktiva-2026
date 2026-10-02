<script setup lang="ts">
import { motion } from "~/landing/motion";
import { STICKERS, type Sticker } from "~/landing/stickers";

/**
 * Перебивка между «Отбором» и «Программой» — «стикер-бомбинг»: наклейки по
 * одной шлёпаются на страницу с пружинкой, последним сверху ложится большой
 * логотип, и соседние наклейки вздрагивают от шлепка.
 *
 * Анимация играет сама (~1,5 с), когда секция показалась, — не следует за
 * прокруткой: так она одинаково плавная при любой скорости листания и на
 * любом телефоне. Ушли выше секции — сбрасывается и при возвращении
 * проиграется снова. Без анимации («уменьшить движение», нет JS) — готовый
 * коллаж. Раскладка — app/landing/stickers.ts.
 */
const section = ref<HTMLElement | null>(null);

// Место — CSS-переменными: на телефоне одна раскладка, на широком — другая.
const place = (item: Sticker) => {
  const narrow = item.narrow ?? item.wide;
  return {
    "--x": `${narrow.x}%`,
    "--y": `${narrow.y}%`,
    "--w": `${narrow.w}%`,
    "--wx": `${item.wide.x}%`,
    "--wy": `${item.wide.y}%`,
    "--ww": `${item.wide.w}%`,
    "--r": `${item.rotate}deg`,
  };
};

let cleanup = () => {};
onMounted(async () => {
  cleanup = await motion(section.value!, ({ gsap, ScrollTrigger }) => {
    // Анимируем внутренний слой: место и наклон держит внешний (CSS), и GSAP
    // их не трогает. Скрытые на телефоне наклейки не анимируем.
    const items = gsap.utils.toArray<HTMLElement>(".piece > .paper").filter((item) => item.offsetParent !== null);
    const logo = section.value!.querySelector<HTMLElement>(".logo > .paper")!;
    const timeline = gsap.timeline({ paused: true });
    const step = 0.08;

    // Наклейка влетает крупной и повёрнутой, прижимается и отпружинивает.
    items.forEach((item, index) => {
      const turn = index % 2 ? 1 : -1;
      const at = index * step;
      timeline
        .fromTo(
          item,
          { autoAlpha: 0, scale: 1.6, rotation: 22 * turn, y: -24 },
          { autoAlpha: 1, scale: 0.92, rotation: -3 * turn, y: 0, duration: 0.16, ease: "power2.in" },
          at,
        )
        .to(item, { scale: 1, rotation: 0, duration: 0.4, ease: "back.out(3)" }, at + 0.16);
    });

    const land = items.length * step + 0.15;
    timeline
      .fromTo(
        logo,
        { autoAlpha: 0, scale: 1.8, rotation: -16, y: -30 },
        { autoAlpha: 1, scale: 0.94, rotation: 2, y: 0, duration: 0.22, ease: "power2.in" },
        land,
      )
      .to(logo, { scale: 1, rotation: 0, duration: 0.5, ease: "back.out(2.5)" }, land + 0.22)
      // Шлепок: соседи вздрагивают.
      .to(items, { y: 5, duration: 0.07, yoyo: true, repeat: 1, ease: "power1.out" }, land + 0.22);

    const trigger = ScrollTrigger.create({
      trigger: section.value!,
      start: "top 70%",
      end: "max",
      onEnter: () => timeline.restart(),
      onLeaveBack: () => timeline.pause(0),
    });
    // Страницу открыли уже ниже перебивки — коллаж сразу готовый.
    if (window.scrollY > trigger.start) timeline.progress(1);
  });
});
onBeforeUnmount(() => cleanup());
</script>

<template>
  <section ref="section" class="relative overflow-hidden px-4 py-20 sm:py-28" aria-label="Школа Актива 2026">
    <div class="relative mx-auto aspect-square w-full max-w-[34rem] sm:aspect-[16/10] sm:max-w-[64rem]">
      <div
        v-for="item in STICKERS"
        :key="item.name"
        class="sticker absolute"
        :class="[item.name === 'logo' ? 'logo' : 'piece', { 'max-sm:hidden': !item.narrow }]"
        :style="place(item)"
      >
        <div class="paper">
          <img
            :src="`/brand/stickers/${item.name}.webp`"
            :alt="item.name === 'logo' ? 'Логотип Школы Актива 2026' : ''"
            class="block h-auto w-full"
            loading="lazy"
            draggable="false"
          >
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
/* Место и наклон — у внешнего слоя; внутренний (.paper) двигает анимация.
   Отдельные свойства translate/rotate не годятся: GSAP вбирает их в свой
   transform и теряет сдвиг по вертикали. */
.sticker {
  left: var(--x);
  top: var(--y);
  width: var(--w);
  transform: translate(-50%, -50%) rotate(var(--r));
}
@media (min-width: 640px) {
  .sticker {
    left: var(--wx);
    top: var(--wy);
    width: var(--ww);
  }
}
.sticker img {
  filter: drop-shadow(0 8px 14px rgb(37 37 37 / 0.16));
}

/* Мышью наклейку можно чуть «поддеть» — она приподнимается. */
@media (hover: hover) and (prefers-reduced-motion: no-preference) {
  .sticker img {
    transition: transform 0.25s cubic-bezier(0.3, 1.6, 0.5, 1);
  }
  .sticker:hover img {
    transform: translateY(-6px) rotate(4deg) scale(1.05);
  }
}
</style>
