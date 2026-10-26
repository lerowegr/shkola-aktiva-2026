<script setup lang="ts">
import { groupKey, taskKey, type AssessmentNotesStore } from "~/composables/useAssessmentNotes";

/**
 * Колонки экспертов подгруппы ЦО: `part="group"` — фон подгруппы (как идёт
 * ЦО в целом), `part="tasks"` — задания о выбранном кандидате. Состояние и
 * опрос — общие, из useAssessmentNotes на странице.
 */
defineProps<{
  store: AssessmentNotesStore;
  part: "group" | "tasks";
  applicationId?: string | null;
  candidateName?: string | null;
}>();
</script>

<template>
  <section v-if="part === 'group'" class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
    <div class="flex flex-col gap-1">
      <h2 class="font-display text-xl">Фон подгруппы</h2>
      <p class="text-ink-soft text-sm">
        Как проходит ЦО в подгруппе в целом: атмосфера, кто тянет, что пошло не по плану. Видят эксперты подгруппы и
        организаторы.
      </p>
    </div>
    <div class="grid gap-2" :class="store.gridClass.value">
      <div
        v-for="column in store.visible.value"
        :key="column.id"
        class="flex min-h-28 flex-col gap-1 rounded-2xl p-3"
        :class="column.isMine && store.canWrite ? 'bg-paper ring-accent/40 focus-within:ring-2' : 'bg-paper/60 border-line border border-dashed'"
      >
        <p class="text-ink-soft flex items-center gap-2 text-xs">
          <span class="font-semibold">{{ store.label(column) }}</span>
          <span v-if="!column.isMine && store.isTyping(groupKey(column.id))" class="text-accent animate-pulse" aria-live="polite">пишет…</span>
        </p>
        <template v-if="column.isMine && store.canWrite">
          <textarea
            :value="store.draft(groupKey(column.id))"
            rows="4"
            maxlength="4000"
            placeholder="Как идёт ЦО в подгруппе…"
            aria-label="Ваш фоновый комментарий подгруппы"
            class="placeholder:text-ink-soft/60 field-sizing-content min-h-24 w-full resize-y bg-transparent text-sm outline-none"
            @input="store.onGroup(($event.target as HTMLTextAreaElement).value)"
          />
          <p v-if="store.failed.value[groupKey(column.id)]" class="text-danger text-xs">{{ store.failed.value[groupKey(column.id)] }}</p>
        </template>
        <p v-else-if="store.texts.get(groupKey(column.id))" class="text-sm whitespace-pre-line">{{ store.texts.get(groupKey(column.id)) }}</p>
        <p v-else class="text-ink-soft/70 text-xs">Пока пусто</p>
      </div>
    </div>
  </section>

  <section v-else-if="applicationId && store.tasks.value.length" class="bg-card border-line flex flex-col gap-5 rounded-3xl border p-5">
    <div class="flex flex-col gap-1">
      <h2 class="font-display text-xl">Задания: {{ candidateName }}</h2>
      <p class="text-ink-soft text-sm">Под каждым заданием — колонка каждого эксперта. Чужой текст появляется сразу. Кандидат этого не видит.</p>
    </div>
    <div v-for="task in store.tasks.value" :key="task.id" class="flex flex-col gap-2">
      <h3 class="text-sm font-semibold">{{ task.title }}</h3>
      <div class="grid gap-2" :class="store.gridClass.value">
        <div
          v-for="column in store.visible.value"
          :key="column.id"
          class="flex min-h-20 flex-col gap-1 rounded-2xl p-3"
          :class="column.isMine && store.canWrite ? 'bg-paper ring-accent/40 focus-within:ring-2' : 'bg-paper/60 border-line border border-dashed'"
        >
          <p class="text-ink-soft flex items-center gap-2 text-xs">
            <span class="font-semibold">{{ store.label(column) }}</span>
            <span v-if="!column.isMine && store.isTyping(taskKey(task.id, applicationId, column.id))" class="text-accent animate-pulse" aria-live="polite">пишет…</span>
          </p>
          <template v-if="column.isMine && store.canWrite">
            <textarea
              :value="store.draft(taskKey(task.id, applicationId, column.id))"
              rows="2"
              maxlength="2000"
              placeholder="Что делал, какую роль взял, что сказал…"
              :aria-label="`Ваш комментарий: ${task.title}`"
              class="placeholder:text-ink-soft/60 field-sizing-content min-h-14 w-full resize-y bg-transparent text-sm outline-none"
              @input="store.onTask(applicationId, task.id, ($event.target as HTMLTextAreaElement).value)"
            />
            <p v-if="store.failed.value[taskKey(task.id, applicationId, column.id)]" class="text-danger text-xs">
              {{ store.failed.value[taskKey(task.id, applicationId, column.id)] }}
            </p>
          </template>
          <p v-else-if="store.texts.get(taskKey(task.id, applicationId, column.id))" class="text-sm whitespace-pre-line">
            {{ store.texts.get(taskKey(task.id, applicationId, column.id)) }}
          </p>
          <p v-else class="text-ink-soft/70 text-xs">Пока пусто</p>
        </div>
      </div>
    </div>
  </section>
</template>
