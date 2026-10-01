<script setup lang="ts">
/**
 * Кнопка. Три вида: главная, спокойная и ссылка-кнопка. Пока идёт запрос,
 * кнопка не нажимается второй раз и показывает, что работает.
 */
const props = withDefaults(
  defineProps<{
    variant?: "primary" | "ghost" | "telegram";
    type?: "button" | "submit";
    pending?: boolean;
    disabled?: boolean;
    href?: string;
    target?: string;
  }>(),
  { variant: "primary", type: "button", pending: false, disabled: false, href: undefined, target: undefined },
);

const classes = computed(() => [
  "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
  "disabled:cursor-not-allowed disabled:opacity-50",
  props.variant === "primary" && "bg-accent text-accent-ink hover:brightness-110 active:brightness-95",
  props.variant === "ghost" && "border border-line bg-card text-ink hover:border-ink-soft",
  props.variant === "telegram" && "bg-[#229ED9] text-white hover:brightness-110 active:brightness-95",
]);
</script>

<template>
  <a v-if="href" :href="href" :target="target" rel="noopener" :class="classes">
    <slot />
  </a>
  <button v-else :type="type" :disabled="disabled || pending" :aria-busy="pending" :class="classes">
    <span
      v-if="pending"
      class="size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
      aria-hidden="true"
    />
    <slot />
  </button>
</template>
