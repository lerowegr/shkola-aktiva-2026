<script setup lang="ts">
import { ArrowRight } from "lucide-vue-next";

import type { LandingCta } from "~/landing/cta";
import { daysLeft } from "~~/lib/site/landing";

/**
 * Плашка заявки — одна на первом экране и в финале: наклейка в стиле
 * бренда (жёлтый, толстая обводка, жёсткая тень), чтобы её нельзя было
 * пропустить. Внутри — состояние отбора, сколько осталось и кнопка.
 *
 * Событие `aim` — наведение или фокус на кнопке: маскоты финала
 * подпрыгивают.
 */
const props = defineProps<{ cta: LandingCta; closesAt: string | null; size?: "lg" | "md" }>();
const emit = defineEmits<{ aim: [active: boolean] }>();

const left = computed(() => (props.cta.live ? daysLeft(props.closesAt) : null));
</script>

<template>
  <div
    class="panel border-ink bg-brand-yellow text-ink flex flex-col items-center gap-4 rounded-3xl border-[3px] px-5 py-5 shadow-[6px_6px_0_#252525] select-text sm:flex-row sm:gap-6 sm:px-6"
    :class="size === 'md' ? 'sm:py-4' : 'sm:py-5'"
  >
    <div class="flex flex-col items-center gap-1 text-center sm:items-start sm:text-left">
      <p class="flex items-center gap-2 font-semibold" :class="size === 'md' ? 'text-base' : 'text-lg'">
        <span v-if="cta.live" class="live bg-ok size-2.5 rounded-full" aria-hidden="true" />
        {{ cta.status }}
      </p>
      <p v-if="left" class="text-ink/75 text-sm">{{ left.charAt(0).toUpperCase() + left.slice(1) }}</p>
    </div>
    <NuxtLink
      :to="cta.to"
      class="landing-button landing-button--primary shrink-0"
      @mouseenter="emit('aim', true)"
      @mouseleave="emit('aim', false)"
      @focus="emit('aim', true)"
      @blur="emit('aim', false)"
    >
      {{ cta.label }}
      <ArrowRight class="arrow size-5" aria-hidden="true" />
    </NuxtLink>
  </div>
</template>

<style scoped>
.panel {
  rotate: -1.5deg;
}

@media (prefers-reduced-motion: no-preference) {
  .live {
    animation: pulse 1.6s ease-in-out infinite;
  }
  .landing-button:hover .arrow {
    translate: 3px 0;
  }
  .arrow {
    transition: translate 0.2s;
  }
}

@keyframes pulse {
  50% {
    box-shadow: 0 0 0 6px rgb(15 122 8 / 0.15);
  }
}
</style>
