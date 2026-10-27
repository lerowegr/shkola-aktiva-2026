<script setup lang="ts">
import type { ActionResult } from "~/composables/useAction";

/**
 * «Перенести…» у кандидата на странице сбора: на другое время, в очередь на
 * резервный день или «не придёт». Выбрал — подтверди; по галочке кандидату
 * придёт уведомление с новым временем и местом.
 */
const props = defineProps<{
  applicationId: string;
  name: string;
  currentSessionId: string;
  targets: { id: string; title: string; startsAt: string; reserve: boolean }[];
}>();
const emit = defineEmits<{ done: [result: ActionResult] }>();

const to = ref("");
const tell = ref(true);
const pending = ref(false);

const options = computed(() => props.targets.filter((target) => target.id !== props.currentSessionId));
const label = computed(() => {
  if (to.value === "reserve") return "в очередь на резервный день";
  if (to.value === "cant") return "в «не придёт»";
  const target = props.targets.find((item) => item.id === to.value);
  return target ? `на «${target.title}» (${mskDay(target.startsAt)}, ${mskTime(target.startsAt)})` : "";
});

async function move() {
  pending.value = true;
  try {
    const result = await $fetch<ActionResult>("/api/staff/assessment/move", {
      method: "POST",
      body: { applicationId: props.applicationId, to: to.value, notify: tell.value },
      ignoreResponseError: true,
    }).catch((): ActionResult => ({ ok: false, message: "Нет связи с сайтом. Проверьте интернет." }));
    to.value = "";
    emit("done", result);
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <UiSelect v-model="to" size="sm" :disabled="pending" :aria-label="`Перенести: ${name}`">
      <option value="" disabled>Перенести…</option>
      <option v-for="target in options" :key="target.id" :value="target.id">
        {{ target.reserve ? "Резервный день" : "Время" }}: {{ mskTime(target.startsAt) }}, {{ mskFormat(target.startsAt, "d MMM") }} — {{ target.title }}
      </option>
      <option value="reserve">В очередь на резервный день</option>
      <option value="cant">Не придёт</option>
    </UiSelect>
    <div v-if="to" class="bg-brand-yellow-soft flex flex-col gap-2 rounded-2xl p-3 text-sm" role="alertdialog" :aria-label="`Перенести ${name}?`">
      <p class="font-semibold">Перенести {{ name }} {{ label }}?</p>
      <UiCheckbox v-if="to !== 'cant'" v-model="tell">Сообщить кандидату (придёт сразу)</UiCheckbox>
      <div class="flex flex-wrap gap-2">
        <button type="button" class="bg-accent text-accent-ink rounded-xl px-4 py-2 font-semibold disabled:opacity-60" :disabled="pending" @click="move">
          Да, перенести
        </button>
        <button type="button" class="text-ink-soft rounded-xl px-4 py-2" @click="to = ''">Отмена</button>
      </div>
    </div>
  </div>
</template>
