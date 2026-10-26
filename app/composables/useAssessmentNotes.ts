import type { ActionResult } from "~/composables/useAction";

/**
 * Живые комментарии подгруппы ЦО — одно состояние на экран: фон подгруппы
 * сверху и задания под кандидатом читают его вместе, опрос один. Свою
 * колонку эксперт пишет, чужие видит: пока экран открыт, раз в пару секунд
 * забираем свежие и подсвечиваем «пишет…» у того, чей текст только что
 * изменился. Как сценарий собеса (Guide.vue). Кандидат этого не видит.
 */
export interface NotesColumn {
  id: string;
  name: string;
  isMine: boolean;
  expert: boolean;
}
export interface AssessmentNotesData {
  columns: NotesColumn[];
  tasks: { id: string; title: string }[];
  taskNotes: { taskId: string; applicationId: string; authorId: string; text: string }[];
  groupNotes: { authorId: string; text: string }[];
}

const POLL_MS = 2000;
const TYPING_MS = 4000;

export const taskKey = (taskId: string, applicationId: string, authorId: string) => `t:${taskId}:${applicationId}:${authorId}`;
export const groupKey = (authorId: string) => `g:${authorId}`;

export function useAssessmentNotes(options: { groupId: string; initial: AssessmentNotesData; canWrite: boolean; myId: string | null }) {
  const columns = ref<NotesColumn[]>(options.initial.columns);
  const tasks = ref(options.initial.tasks);
  /** Ключ: `t:<задание>:<кандидат>:<автор>` или `g:<автор>`. */
  const texts = reactive(new Map<string, string>());
  const typing = reactive(new Map<string, number>());
  const drafts = reactive(new Map<string, string>());

  function absorb(data: AssessmentNotesData, initial = false) {
    columns.value = data.columns;
    tasks.value = data.tasks;
    const at = Date.now();
    const seen = new Set<string>();
    const put = (id: string, text: string) => {
      seen.add(id);
      if (!initial && texts.get(id) !== text) typing.set(id, at + TYPING_MS);
      texts.set(id, text);
    };
    for (const row of data.taskNotes) put(taskKey(row.taskId, row.applicationId, row.authorId), row.text);
    for (const row of data.groupNotes) put(groupKey(row.authorId), row.text);
    for (const id of [...texts.keys()]) {
      if (seen.has(id)) continue;
      if (!initial) typing.set(id, at + TYPING_MS);
      texts.delete(id);
    }
  }
  absorb(options.initial, true);

  /** Черновик своей ячейки: то, что набрано, а не то, что пришло с сервера. */
  const draft = (id: string) => (drafts.has(id) ? drafts.get(id)! : (texts.get(id) ?? ""));

  const visible = computed<NotesColumn[]>(() => {
    const list = columns.value.filter((column) => column.expert || [...texts.keys()].some((id) => id.endsWith(`:${column.id}`)));
    if (options.canWrite && options.myId && !list.some((column) => column.isMine)) {
      list.push({ id: options.myId, name: "Вы", isMine: true, expert: true });
    }
    return list;
  });
  const label = (column: NotesColumn) => (column.isMine && column.name !== "Вы" ? `${column.name} (вы)` : column.name);
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
      absorb(await $fetch<AssessmentNotesData>("/api/staff/assessment/notes", { query: { groupId: options.groupId } }));
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

  function onTask(applicationId: string, taskId: string, value: string) {
    if (!options.myId) return;
    const id = taskKey(taskId, applicationId, options.myId);
    drafts.set(id, value);
    autosave.schedule(id, () => persist(id, "/api/staff/assessment/task-note", { applicationId, taskId, text: value }, value));
  }

  function onGroup(value: string) {
    if (!options.myId) return;
    const id = groupKey(options.myId);
    drafts.set(id, value);
    autosave.schedule(id, () => persist(id, "/api/staff/assessment/group-note", { groupId: options.groupId, text: value }, value));
  }

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
    void autosave.flush();
  });

  const isTyping = (id: string) => (typing.get(id) ?? 0) > now.value;

  return { canWrite: options.canWrite, tasks, texts, failed, visible, label, gridClass, draft, onTask, onGroup, isTyping };
}

export type AssessmentNotesStore = ReturnType<typeof useAssessmentNotes>;
