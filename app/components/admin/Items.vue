<script setup lang="ts" generic="T">
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-vue-next";

/**
 * Список однотипных пунктов в форме: добавить, убрать, переставить.
 * Поля пункта рисует родитель в слоте — у программы одни, у вопросов другие.
 */
const props = defineProps<{ max: number; addLabel: string; title: (item: T, index: number) => string; create: () => T }>();
const items = defineModel<T[]>({ required: true });

const add = () => (items.value = [...items.value, props.create()]);
const remove = (index: number) => (items.value = items.value.filter((_, i) => i !== index));
function move(index: number, direction: -1 | 1) {
  const next = [...items.value];
  const [item] = next.splice(index, 1);
  next.splice(index + direction, 0, item as T);
  items.value = next;
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <ol v-if="items.length" class="flex flex-col gap-3">
      <li v-for="(item, index) in items" :key="index" class="border-line bg-paper flex flex-col gap-3 rounded-2xl border p-4">
        <div class="flex items-center justify-between gap-2">
          <span class="min-w-0 truncate text-sm font-semibold">{{ title(item, index) }}</span>
          <span class="flex shrink-0">
            <button type="button" class="hover:bg-card grid size-8 place-items-center rounded-lg disabled:opacity-30" :disabled="index === 0" :aria-label="`Выше: ${title(item, index)}`" @click="move(index, -1)"><ArrowUp class="size-4" /></button>
            <button type="button" class="hover:bg-card grid size-8 place-items-center rounded-lg disabled:opacity-30" :disabled="index === items.length - 1" :aria-label="`Ниже: ${title(item, index)}`" @click="move(index, 1)"><ArrowDown class="size-4" /></button>
            <button type="button" class="hover:text-danger grid size-8 place-items-center rounded-lg" :aria-label="`Убрать: ${title(item, index)}`" @click="remove(index)"><Trash2 class="size-4" /></button>
          </span>
        </div>
        <slot :item="item" :index="index" />
      </li>
    </ol>
    <button
      v-if="items.length < max"
      type="button"
      class="border-line text-ink-soft hover:text-ink hover:border-ink-soft flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-dashed text-sm"
      @click="add"
    >
      <Plus class="size-4" aria-hidden="true" /> {{ addLabel }}
    </button>
    <p v-else class="text-ink-soft text-sm">Больше {{ max }} не поместится.</p>
  </div>
</template>
