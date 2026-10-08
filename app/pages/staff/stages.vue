<script setup lang="ts">
import type { StageState } from "~~/lib/stages";

/**
 * Этапы отбора: когда открываются и закрываются. По датам этапы
 * переключаются сами; «открыт» и «закрыт» — ручное решение поверх дат,
 * например чтобы продлить приём на день.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Этапы" });

interface StageRow {
  id: string;
  kind: string;
  description: string | null;
  title: string;
  state: StageState;
  mode: "AUTO" | "OPEN" | "CLOSED";
  opensAt: string | null;
  closesAt: string | null;
}

const { data, refresh } = await useFetch<{ season: { title: string; stages: StageRow[] } | null }>("/api/staff/stages");

// Поля datetime-local — без часового пояса; заполняем и читаем их по Москве.
const local = mskInputValue;
const iso = mskFromInput;

const forms = reactive<
  Record<string, { opensAt: string; closesAt: string; mode: StageRow["mode"]; description: string }>
>({});
watch(
  data,
  (value) => {
    for (const stage of value?.season?.stages ?? []) {
      forms[stage.id] = {
        opensAt: local(stage.opensAt),
        closesAt: local(stage.closesAt),
        mode: stage.mode,
        description: stage.description ?? "",
      };
    }
  },
  { immediate: true },
);

const save = useAction("/api/staff/stages/update");
const savingId = ref<string | null>(null);

async function submit(stageId: string) {
  const form = forms[stageId]!;
  savingId.value = stageId;
  const result = await save.submit({
    stageId,
    opensAt: iso(form.opensAt),
    closesAt: iso(form.closesAt),
    mode: form.mode,
    description: form.description,
  });
  if (result.ok) {
    await refresh();
    await refreshNuxtData("staff-nav");
  }
}

const STATE: Record<StageState, { label: string; tone: string }> = {
  upcoming: { label: "Скоро", tone: "bg-paper text-ink-soft" },
  open: { label: "Открыт", tone: "bg-brand-green-soft text-ok" },
  closed: { label: "Закрыт", tone: "bg-brand-red-soft text-danger" },
};

const MODES = [
  { key: "AUTO", label: "По датам" },
  { key: "OPEN", label: "Открыт" },
  { key: "CLOSED", label: "Закрыт" },
] as const;
</script>

<template>
  <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
    <StaffAdminNav />
    <div class="flex flex-col gap-1">
      <h1 class="font-display text-3xl">Этапы</h1>
      <p class="text-ink-soft text-sm">
        По датам этапы открываются и закрываются сами. «Открыт» и «Закрыт» — ручное решение поверх дат. Время —
        по часам вашего компьютера.
      </p>
    </div>

    <form
      v-for="stage in data?.season?.stages ?? []"
      :key="stage.id"
      class="bg-card border-line flex flex-col gap-4 rounded-3xl border p-5"
      @submit.prevent="submit(stage.id)"
    >
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-lg font-semibold">{{ stage.title }}</h2>
        <span class="rounded-full px-2.5 py-1 text-xs font-semibold" :class="STATE[stage.state].tone">
          {{ STATE[stage.state].label }}
        </span>
      </div>

      <div v-if="forms[stage.id]" class="grid gap-4 sm:grid-cols-2">
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          Открывается, по Москве
          <input
            v-model="forms[stage.id]!.opensAt"
            type="datetime-local"
            class="border-line bg-paper min-h-12 rounded-2xl border px-4 text-base"
          >
        </label>
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          Закрывается, по Москве
          <input
            v-model="forms[stage.id]!.closesAt"
            type="datetime-local"
            class="border-line bg-paper min-h-12 rounded-2xl border px-4 text-base"
          >
        </label>
      </div>

      <div v-if="forms[stage.id]" role="radiogroup" aria-label="Режим" class="bg-paper grid grid-cols-3 gap-1 rounded-2xl p-1">
        <button
          v-for="mode in MODES"
          :key="mode.key"
          type="button"
          role="radio"
          :aria-checked="forms[stage.id]!.mode === mode.key"
          class="min-h-10 rounded-xl text-sm font-medium"
          :class="forms[stage.id]!.mode === mode.key ? 'bg-card shadow-sm' : 'text-ink-soft'"
          @click="forms[stage.id]!.mode = mode.key"
        >
          {{ mode.label }}
        </button>
      </div>

      <label v-if="forms[stage.id]" class="flex flex-col gap-1.5 text-sm font-medium">
        {{ stage.kind === "HOMEWORK" ? "Текст задания" : "Пояснение для кандидатов" }}
        <textarea
          v-model="forms[stage.id]!.description"
          rows="4"
          maxlength="5000"
          :placeholder="
            stage.kind === 'HOMEWORK'
              ? 'Что сделать, в каком виде сдать, на что обратить внимание'
              : stage.kind === 'ASSESSMENT'
                ? 'Что за этап: очный, групповой, сколько длится, что взять с собой'
                : 'Необязательно'
          "
          class="border-line bg-paper rounded-2xl border px-4 py-3 text-base font-normal"
        />
        <span v-if="stage.kind === 'HOMEWORK'" class="text-ink-soft text-xs font-normal">
          Кандидаты видят задание только после того, как прошли этап анкеты.
        </span>
        <span v-else-if="stage.kind === 'ASSESSMENT'" class="text-ink-soft text-xs font-normal">
          Кандидаты видят это в кабинете. Корпус, аудитория и время у каждой группы свои — их задают и рассылают в
          «Центре оценки».
        </span>
      </label>

      <UiNotice
        v-if="savingId === stage.id"
        :ok="save.result.value?.ok"
        :message="save.result.value?.message"
      />
      <UiButton type="submit" variant="ghost" :pending="save.pending.value && savingId === stage.id">
        Сохранить
      </UiButton>
    </form>
  </main>
</template>
