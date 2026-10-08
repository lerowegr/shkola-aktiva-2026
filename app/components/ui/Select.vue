<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";

/**
 * Селект в стиле брендбука: фон и стрелка свои, нативного Aqua нет.
 * appearance-none убирает системный градиент и стрелку ↕, шеврон рисуем сами.
 */
withDefaults(
  defineProps<{
    label?: string;
    id?: string;
    disabled?: boolean;
    ariaLabel?: string;
    size?: "lg" | "md" | "sm" | "xs";
  }>(),
  { label: undefined, id: undefined, disabled: false, ariaLabel: undefined, size: "lg" },
);

const model = defineModel<string>({ default: "" });
const fallbackId = useId();

const SIZES = {
  lg: { field: "min-h-12 rounded-2xl px-4 text-base", pad: "pr-11", icon: "size-5 right-4" },
  md: { field: "min-h-11 rounded-xl px-3 text-sm", pad: "pr-10", icon: "size-5 right-3" },
  sm: { field: "min-h-10 rounded-xl px-3 text-sm", pad: "pr-9", icon: "size-4 right-3" },
  xs: { field: "min-h-8 rounded-lg px-2 text-xs", pad: "pr-8", icon: "size-4 right-2" },
} as const;
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1.5">
    <label v-if="label" :for="id ?? fallbackId" class="text-sm font-medium">{{ label }}</label>
    <div class="relative">
      <select
        :id="id ?? fallbackId"
        v-model="model"
        :disabled="disabled"
        :aria-label="ariaLabel"
        class="border-line bg-card focus:border-accent focus:ring-accent/20 w-full appearance-none border outline-none focus:ring-4 disabled:opacity-60"
        :class="[SIZES[size].field, SIZES[size].pad]"
      >
        <slot />
      </select>
      <ChevronDown
        class="text-ink-soft pointer-events-none absolute top-1/2 -translate-y-1/2"
        :class="SIZES[size].icon"
        aria-hidden="true"
      />
    </div>
  </div>
</template>
