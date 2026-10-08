<script setup lang="ts">
/** Форма раздела анкеты: название шага и описание под ним, как в Google Forms. */
const props = defineProps<{ section: { id: string; title: string; description: string | null } | null }>();
const emit = defineEmits<{ saved: []; cancel: [] }>();

const form = reactive({ title: props.section?.title ?? "", description: props.section?.description ?? "" });
const save = useAction("/api/admin/forms/section");

async function submit() {
  const result = await save.submit({ id: props.section?.id, title: form.title, description: form.description || null });
  if (result.ok) emit("saved");
}
</script>

<template>
  <form class="bg-paper flex flex-col gap-4 rounded-2xl p-4" @submit.prevent="submit">
    <UiInput v-model="form.title" label="Название раздела — заголовок шага" placeholder="Например, Контактная информация" />
    <label class="flex flex-col gap-1.5 text-sm font-medium">
      Описание — кандидат видит его над вопросами раздела
      <textarea
        v-model="form.description"
        rows="3"
        maxlength="1000"
        class="border-line bg-card rounded-2xl border px-4 py-3 text-base font-normal"
        placeholder="Зачем этот раздел и как отвечать. Можно оставить пустым."
      />
    </label>
    <p v-if="section" class="text-ink-soft text-xs">Переименование переносит все вопросы раздела.</p>
    <UiNotice :message="save.result.value?.ok ? null : save.result.value?.message" />
    <div class="flex gap-2 sm:w-80">
      <UiButton variant="ghost" @click="emit('cancel')">Отмена</UiButton>
      <UiButton type="submit" :pending="save.pending.value">Сохранить</UiButton>
    </div>
  </form>
</template>
