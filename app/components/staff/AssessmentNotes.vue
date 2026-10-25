<script setup lang="ts">
import type { ActionResult } from "~/composables/useAction";

/**
 * Живые комментарии подгруппы ЦО: по каждому заданию — колонки экспертов о
 * выбранном кандидате, ниже — фон подгруппы (как идёт ЦО). Свою колонку
 * эксперт пишет, чужие видит: пока экран открыт, раз в пару секунд забираем
 * свежие и подсвечиваем «пишет…» у того, чей текст только что изменился.
 * Как сценарий собеса (Guide.vue). Кандидат этого не видит.
 */
interface Column {
  id: string;
  name: string;
  isMine: boolean;
  expert: boolean;
}
interface Notes {
  columns: Column[];
  tasks: { id: string; title: string }[];
  taskNotes: { taskId: string; applicationId: string; authorId: string; text: string }[];
  groupNotes: { authorId: string; text: string }[];
}

const props = defineProps<{
  groupId: string;
  initial: Notes;
  applicationId: string | null;
  candidateName: string | null;
  canWrite: boolean;
  myId: string | null;
}>();

const POLL_MS = 2000;
const TYPING_MS = 4000;

const columns = ref<Column[]>(props.initial.columns);
const tasks = ref(props.initial.tasks);
/** Ключ: `t:<задание>:<кандидат>:<автор>` или `g:<автор>`. */
const texts = reactive(new Map<string, string>());
const typing = reactive(new Map<string, number>());
const drafts = reactive(new Map<string, string>());

const taskKey = (taskId: string, applicationId: string, authorId: string) => `t:${taskId}:${applicationId}:${authorId}`;
const groupKey = (authorId: string) => `g:${authorId}`;

function absorb(data: Notes, initial = false) {
  columns.value = data.columns;
  tasks.value = data.tasks;
  const now = Date.now();
  const seen = new Set<string>();
  const put = (id: string, text: string) => {
    seen.add(id);
    if (!initial && texts.get(id) !== text) typing.set(id, now + TYPING_MS);
    texts.set(id, text);
  };
  for (const row of data.taskNotes) put(taskKey(row.taskId, row.applicationId, row.authorId), row.text);
  for (const row of data.groupNotes) put(groupKey(row.authorId), row.text);
  for (const id of [...texts.keys()]) {
    if (seen.has(id)) continue;
    if (!initial) typing.set(id, now + TYPING_MS);
    texts.delete(id);
  }
}
absorb(props.initial, true);

/** Черновик своей ячейки: то, что набрано, а не то, что пришло с сервера. */
function draft(id: string) {
  return drafts.has(id) ? drafts.get(id)! : (texts.get(id) ?? "");
}

const visible = computed<Column[]>(() => {
  const list = columns.value.filter((column) => column.expert || [...texts.keys()].some((id) => id.endsWith(`:${column.id}`)));
  if (props.canWrite && props.myId && !list.some((column) => column.isMine)) {
    list.push({ id: props.myId, name: "Вы", isMine: true, expert: true });
  }
  return list;
});
const label = (column: Column) => (column.isMine && column.name !== "Вы" ? `${column.name} (вы)` : column.name);
const gridClass = computed(() => (visible.value.length >= 3 ? "sm:grid-cols-3" : visible.value.length === 2 ? "sm:grid-cols-2" : ""));

// Опрос — только пока вкладка на виду.
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
let polling = false;
async function poll() {
  now.value = Date.now();
  if (polling || document.visibilityState !== "visible") return;
  polling = true;
  try {
    absorb(await $fetch<Notes>("/api/staff/assessment/notes", { query: { groupId: props.groupId } }));
  } catch {
    // Сеть моргнула — заберём на следующем круге.
  } finally {
    polling = false;
  }
}
onMounted(() => {
  timer = setInterval(poll, POLL_MS);
});

const autosave = useAutosave(300);
const failed = ref<Record<string, string | null>>({});

async function persist(id: string, url: string, body: Record<string, unknown>, value: string): Promise<ActionResult> {
  const result = await $fetch<ActionResult>(url, { method: "POST", body, ignoreResponseError: true }).catch(
    (): ActionResult => ({ ok: false, message: "Нет связи с сайтом. Проверьте интернет." }),
  );
  failed.value[id] = result.ok ? null : (result.message ?? "Не сохранилось.");
  if (result.ok) {
    if (value.trim()) texts.set(id, value);
    else texts.delete(id);
  }
  return result;
}

function onTask(taskId: string, value: string) {
  if (!props.applicationId || !props.myId) return;
  const applicationId = props.applicationId;
  const id = taskKey(taskId, applicationId, props.myId);
  drafts.set(id, value);
  autosave.schedule(id, () => persist(id, "/api/staff/assessment/task-note", { applicationId, taskId, text: value }, value));
}

function onGroup(value: string) {
  if (!props.myId) return;
  const id = groupKey(props.myId);
  drafts.set(id, value);
  autosave.schedule(id, () => persist(id, "/api/staff/assessment/group-note", { groupId: props.groupId, text: value }, value));
}

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  void autosave.flush();
});

const isTyping = (id: string) => (typing.get(id) ?? 0) > now.value;
</script>

<template>
  <div class="flex flex-col gap-4">
    <section v-if="applicationId && tasks.length" class="bg-card border-line flex flex-col gap-5 rounded-3xl border p-5">
      <div class="flex flex-col gap-1">
        <h2 class="font-display text-xl">Задания: {{ candidateName }}</h2>
        <p class="text-ink-soft text-sm">Под каждым заданием — колонка каждого эксперта. Чужой текст появляется сразу. Кандидат этого не видит.</p>
      </div>
      <div v-for="task in tasks" :key="task.id" class="flex flex-col gap-2">
        <h3 class="text-sm font-semibold">{{ task.title }}</h3>
        <div class="grid gap-2" :class="gridClass">
          <div
            v-for="column in visible"
            :key="column.id"
            class="flex min-h-20 flex-col gap-1 rounded-2xl p-3"
            :class="column.isMine && canWrite ? 'bg-paper ring-accent/40 focus-within:ring-2' : 'bg-paper/60 border-line border border-dashed'"
          >
            <p class="text-ink-soft flex items-center gap-2 text-xs">
              <span class="font-semibold">{{ label(column) }}</span>
              <span v-if="!column.isMine && isTyping(taskKey(task.id, applicationId, column.id))" class="text-accent animate-pulse" aria-live="polite">пишет…</span>
            </p>
            <template v-if="column.isMine && canWrite">
              <textarea
                :value="draft(taskKey(task.id, applicationId, column.id))"
                rows="2"
                maxlength="2000"
                placeholder="Что делал, какую роль взял, что сказал…"
                :aria-label="`Ваш комментарий: ${task.title}`"
                class="placeholder:text-ink-soft/60 field-sizing-content min-h-14 w-full resize-y bg-transparent text-sm outline-none"
                @input="onTask(task.id, ($event.target as HTMLTextAreaElement).value)"
              />
              <p v-if="failed[taskKey(task.id, applicationId, column.id)]" class="text-danger text-xs">{{ failed[taskKey(task.id, applicationId, column.id)] }}</p>
            </template>
            <p v-else-if="texts.get(taskKey(task.id, applicationId, column.id))" class="text-sm whitespace-pre-line">
              {{ texts.get(taskKey(task.id, applicationId, column.id)) }}
            </p>
            <p v-else class="text-ink-soft/70 text-xs">Пока пусто</p>
          </div>
        </div>
      </div>
    </section>

    <section class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
      <div class="flex flex-col gap-1">
        <h2 class="font-display text-xl">Фон подгруппы</h2>
        <p class="text-ink-soft text-sm">Как проходит ЦО в подгруппе в целом: атмосфера, кто тянет, что пошло не по плану. Видят эксперты подгруппы и организаторы.</p>
      </div>
      <div class="grid gap-2" :class="gridClass">
        <div
          v-for="column in visible"
          :key="column.id"
          class="flex min-h-28 flex-col gap-1 rounded-2xl p-3"
          :class="column.isMine && canWrite ? 'bg-paper ring-accent/40 focus-within:ring-2' : 'bg-paper/60 border-line border border-dashed'"
        >
          <p class="text-ink-soft flex items-center gap-2 text-xs">
            <span class="font-semibold">{{ label(column) }}</span>
            <span v-if="!column.isMine && isTyping(groupKey(column.id))" class="text-accent animate-pulse" aria-live="polite">пишет…</span>
          </p>
          <template v-if="column.isMine && canWrite">
            <textarea
              :value="draft(groupKey(column.id))"
              rows="4"
              maxlength="4000"
              placeholder="Как идёт ЦО в подгруппе…"
              aria-label="Ваш фоновый комментарий подгруппы"
              class="placeholder:text-ink-soft/60 field-sizing-content min-h-24 w-full resize-y bg-transparent text-sm outline-none"
              @input="onGroup(($event.target as HTMLTextAreaElement).value)"
            />
            <p v-if="failed[groupKey(column.id)]" class="text-danger text-xs">{{ failed[groupKey(column.id)] }}</p>
          </template>
          <p v-else-if="texts.get(groupKey(column.id))" class="text-sm whitespace-pre-line">{{ texts.get(groupKey(column.id)) }}</p>
          <p v-else class="text-ink-soft/70 text-xs">Пока пусто</p>
        </div>
      </div>
    </section>
  </div>
</template>
