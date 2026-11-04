<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";

/**
 * Селект в стиле брендбука. Два режима:
 *  - обычный нативный <select> со слотом <option> (appearance-none убирает
 *    системный градиент и стрелку ↕, шеврон рисуем сами);
 *  - свой выпадающий список, если задан `options`: попап рисуем сами —
 *    нативного меню на macOS и Windows нет, стиль один везде.
 */
export interface SelectOption {
  value: string;
  label: string;
}

const props = withDefaults(
  defineProps<{
    label?: string;
    id?: string;
    disabled?: boolean;
    ariaLabel?: string;
    size?: "lg" | "md" | "sm" | "xs";
    options?: SelectOption[];
  }>(),
  {
    label: undefined,
    id: undefined,
    disabled: false,
    ariaLabel: undefined,
    size: "lg",
    options: undefined,
  },
);

const model = defineModel<string>({ default: "" });
const fallbackId = useId();

const SIZES = {
  lg: { field: "min-h-12 rounded-2xl px-4 text-base", pad: "pr-11", icon: "size-5 right-4" },
  md: { field: "min-h-11 rounded-xl px-3 text-sm", pad: "pr-10", icon: "size-5 right-3" },
  sm: { field: "min-h-10 rounded-xl px-3 text-sm", pad: "pr-9", icon: "size-4 right-3" },
  xs: { field: "min-h-8 rounded-lg px-2 text-xs", pad: "pr-8", icon: "size-4 right-2" },
} as const;

// ── Свой список ──
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const activeIndex = ref(0);

const current = computed(() => props.options?.find((option) => option.value === model.value));
const currentLabel = computed(() => current.value?.label ?? "");

function openList() {
  if (props.disabled) return;
  activeIndex.value = Math.max(
    0,
    (props.options ?? []).findIndex((option) => option.value === model.value),
  );
  open.value = true;
}
function pick(option: SelectOption) {
  model.value = option.value;
  open.value = false;
}
function move(step: number) {
  const count = props.options?.length ?? 0;
  if (!count) return;
  activeIndex.value = (activeIndex.value + step + count) % count;
}
function onKeydown(event: KeyboardEvent) {
  if (!props.options) return;
  if (!open.value) {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      openList();
    }
    return;
  }
  if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
  else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
  else if (event.key === "Enter") { event.preventDefault(); const option = props.options[activeIndex.value]; if (option) pick(option); }
  else if (event.key === "Escape") { open.value = false; }
}
function onOutside(event: PointerEvent) {
  if (open.value && root.value && !root.value.contains(event.target as Node)) open.value = false;
}
onMounted(() => document.addEventListener("pointerdown", onOutside));
onBeforeUnmount(() => document.removeEventListener("pointerdown", onOutside));
</script>

<template>
  <div ref="root" class="relative flex min-w-0 flex-col gap-1.5">
    <label v-if="label && !options" :for="id ?? fallbackId" class="text-sm font-medium">{{ label }}</label>

    <!-- Свой список -->
    <template v-if="options">
      <button
        v-if="label"
        type="button"
        class="self-start text-sm font-medium"
        :aria-expanded="open"
        @click="open ? (open = false) : openList()"
      >
        {{ label }}
      </button>
      <button
        type="button"
        :disabled="disabled"
        class="border-line bg-card focus:border-accent focus:ring-accent/20 inline-flex w-full items-center justify-between gap-2 border text-left outline-none focus:ring-4 disabled:opacity-60"
        :class="[SIZES[size].field, open ? 'border-accent' : '']"
        :aria-expanded="open"
        :aria-haspopup="'listbox'"
        :aria-label="ariaLabel ?? label"
        @click="open ? (open = false) : openList()"
        @keydown="onKeydown"
      >
        <span class="truncate" :class="current ? '' : 'text-ink-soft'">{{ currentLabel || ariaLabel || label || "—" }}</span>
        <ChevronDown class="text-ink-soft size-4 shrink-0 transition-transform" :class="{ 'rotate-180': open }" aria-hidden="true" />
      </button>
      <Transition name="select-pop">
        <ul
          v-if="open"
          role="listbox"
          class="bg-card border-line absolute top-full left-0 z-40 mt-1 max-h-64 w-full min-w-44 overflow-auto rounded-xl border p-1 shadow-lg"
        >
          <li v-for="(option, index) in options" :key="option.value" role="none">
            <button
              type="button"
              role="option"
              :aria-selected="option.value === model"
              class="w-full rounded-lg px-3 py-2 text-left text-sm outline-none"
              :class="[
                option.value === model ? 'bg-ink text-paper font-medium' : index === activeIndex ? 'bg-paper' : '',
                option.value === model || index === activeIndex ? '' : 'hover:bg-paper',
              ]"
              @pointerenter="activeIndex = index"
              @click="pick(option)"
            >
              {{ option.label }}
            </button>
          </li>
        </ul>
      </Transition>
    </template>

    <!-- Нативный select со слотом -->
    <template v-else>
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
    </template>
  </div>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .select-pop-enter-active,
  .select-pop-leave-active {
    transition:
      opacity 0.14s ease,
      transform 0.14s cubic-bezier(0.2, 0, 0, 1);
  }
  .select-pop-enter-from,
  .select-pop-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
