<script setup lang="ts">
import type { ActionResult } from "~/composables/useAction";

/**
 * Сценарий собеседования: блоки вопросов, под каждым вопросом — колонки
 * мастеров собеседования, слева направо в одном порядке у всех. Свою
 * колонку мастер пишет, чужие видит: пока сценарий открыт, страница каждые
 * пару секунд забирает заметки и подсвечивает «пишет…» у того, чей текст
 * только что изменился.
 */
interface Column {
  id: string;
  name: string;
  isMine: boolean;
  assigned: boolean;
}
interface NoteRow {
  questionId: string;
  authorId: string;
  note: string;
}
interface Notes {
  columns: Column[];
  notes: NoteRow[];
}
interface Guide extends Notes {
  blocks: { block: string; items: { id: string; text: string; intro: boolean }[] }[];
}

const props = defineProps<{ guide: Guide; applicationId: string; canWrite: boolean; myId: string | null }>();

const POLL_MS = 2000;
const TYPING_MS = 4000;

const key = (questionId: string, authorId: string) => `${questionId}:${authorId}`;

const columns = ref<Column[]>(props.guide.columns);
const notes = reactive(new Map<string, string>());
const typing = reactive(new Map<string, number>());
const drafts = reactive(new Map<string, string>());

function absorb(data: Notes, initial = false) {
  columns.value = data.columns;
  const seen = new Set<string>();
  const now = Date.now();
  for (const row of data.notes) {
    const id = key(row.questionId, row.authorId);
    seen.add(id);
    if (!initial && notes.get(id) !== row.note) typing.set(id, now + TYPING_MS);
    notes.set(id, row.note);
  }
  for (const id of [...notes.keys()]) {
    if (seen.has(id)) continue;
    if (!initial) typing.set(id, now + TYPING_MS);
    notes.delete(id);
  }
}
absorb(props.guide, true);

for (const block of props.guide.blocks) {
  for (const item of block.items) {
    if (props.myId) drafts.set(item.id, notes.get(key(item.id, props.myId)) ?? "");
  }
}

/** Колонки на экране: назначенные, все, кто уже писал, и своя — если можно писать. */
const visible = computed<Column[]>(() => {
  const list = columns.value.filter(
    (column) => column.assigned || column.isMine || [...notes.keys()].some((id) => id.endsWith(`:${column.id}`)),
  );
  const shown = list.filter((column) => !column.isMine || props.canWrite || hasNotes(column.id));
  if (props.canWrite && props.myId && !shown.some((column) => column.isMine)) {
    shown.push({ id: props.myId, name: "Вы", isMine: true, assigned: false });
  }
  return shown;
});

function hasNotes(authorId: string) {
  return [...notes.keys()].some((id) => id.endsWith(`:${authorId}`));
}

const label = (column: Column) => (column.isMine && column.name !== "Вы" ? `${column.name} (вы)` : column.name);
const legend = computed(() => {
  const list = visible.value;
  if (list.length === 2) return `Слева — ${label(list[0]!)}, справа — ${label(list[1]!)}. Каждый пишет в своей колонке, текст второго появляется сразу, пока он пишет.`;
  if (list.length > 2) return `Колонки слева направо: ${list.map(label).join(", ")}. Каждый пишет в своей, чужой текст появляется сразу.`;
  return "Пока пишет только один мастер — колонка второго появится, как только его назначат.";
});

const gridClass = computed(() =>
  visible.value.length >= 3 ? "sm:grid-cols-3" : visible.value.length === 2 ? "sm:grid-cols-2" : "",
);

// Опрос: только в браузере и только пока вкладка на виду.
const now = ref(Date.now());
let timer: ReturnType<typeof setInterval> | null = null;
let polling = false;

async function poll() {
  now.value = Date.now();
  if (polling || document.visibilityState !== "visible") return;
  polling = true;
  try {
    const data = await $fetch<Notes>("/api/staff/interviews/notes", { query: { applicationId: props.applicationId } });
    absorb(data);
  } catch {
    // Сеть моргнула — заберём на следующем круге.
  } finally {
    polling = false;
  }
}

onMounted(() => {
  timer = setInterval(poll, POLL_MS);
});

// Своя колонка — автосохранение; запросы одного вопроса идут по очереди.
const autosave = useAutosave(300);
const failed = ref<Record<string, string | null>>({});

async function persist(questionId: string, value: string): Promise<ActionResult> {
  const result = await $fetch<ActionResult>("/api/staff/interviews/note", {
    method: "POST",
    body: { applicationId: props.applicationId, questionId, note: value },
    ignoreResponseError: true,
  });
  failed.value[questionId] = result.ok ? null : (result.message ?? "Не сохранилось.");
  if (result.ok && props.myId) {
    if (value.trim()) notes.set(key(questionId, props.myId), value);
    else notes.delete(key(questionId, props.myId));
  }
  return result;
}

function onInput(questionId: string, value: string) {
  drafts.set(questionId, value);
  autosave.schedule(questionId, () => persist(questionId, value));
}

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  void autosave.flush();
});

function isTyping(questionId: string, authorId: string) {
  return (typing.get(key(questionId, authorId)) ?? 0) > now.value;
}
</script>

<template>
  <section class="flex flex-col gap-5">
    <div class="flex flex-col gap-1">
      <h2 class="font-display text-2xl">Сценарий собеседования</h2>
      <p class="text-ink-soft text-sm">{{ legend }} Кандидат этого не видит.</p>
    </div>

    <section v-for="block in guide.blocks" :key="block.block" class="bg-card border-line flex flex-col gap-5 rounded-3xl border p-5">
      <h3 class="font-display text-xl">{{ block.block }}</h3>
      <div v-for="item in block.items" :key="item.id" class="flex flex-col gap-2">
        <p class="text-sm font-medium whitespace-pre-line">{{ item.text }}</p>
        <div v-if="!item.intro && visible.length" class="grid gap-2" :class="gridClass">
          <div
            v-for="column in visible"
            :key="column.id"
            class="flex min-h-24 flex-col gap-1 rounded-2xl p-3 transition"
            :class="column.isMine && canWrite ? 'bg-paper ring-accent/40 focus-within:ring-2' : 'bg-paper/60 border-line border border-dashed'"
          >
            <p class="text-ink-soft flex items-center gap-2 text-xs">
              <span class="font-semibold">{{ label(column) }}</span>
              <span v-if="!column.isMine && isTyping(item.id, column.id)" class="text-accent animate-pulse" aria-live="polite">пишет…</span>
            </p>
            <template v-if="column.isMine && canWrite">
              <textarea
                :value="drafts.get(item.id) ?? ''"
                rows="2"
                maxlength="2000"
                placeholder="Что ответил, как держался…"
                :aria-label="`Ваш комментарий: ${item.text}`"
                class="placeholder:text-ink-soft/60 field-sizing-content min-h-16 w-full resize-y bg-transparent text-sm outline-none"
                @input="onInput(item.id, ($event.target as HTMLTextAreaElement).value)"
              />
              <p v-if="failed[item.id]" class="text-danger text-xs">{{ failed[item.id] }}</p>
            </template>
            <p v-else-if="notes.get(`${item.id}:${column.id}`)" class="text-sm whitespace-pre-line">{{ notes.get(`${item.id}:${column.id}`) }}</p>
            <p v-else class="text-ink-soft/70 text-xs">Пока пусто</p>
          </div>
        </div>
      </div>
    </section>
  </section>
</template>
