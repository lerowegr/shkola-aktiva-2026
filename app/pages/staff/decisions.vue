<script setup lang="ts">
import { Check, Clock3, FileSpreadsheet, Lock, MessageSquareText, X } from "lucide-vue-next";

import type { FinalPart, RankRow } from "~~/lib/applications/decisions";
import { facultyMatches } from "~~/lib/profile/faculty";

/**
 * «Итоги отбора»: кто проходит в Школу. Отсева между этапами нет — решение
 * одно, в конце. Рейтинг — сумма средних баллов анкеты, ДЗ, ЦО и
 * собеседования. Публикация временно отключена; отметки остаются черновиками.
 * Из ранее опубликованного резерва можно пригласить на освободившееся место.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Итоги отбора" });

const PART_LABEL: Record<FinalPart, string> = { APPLICATION: "Анкета", HOMEWORK: "ДЗ", ASSESSMENT: "ЦО", INTERVIEW: "Собес" };

const { data, refresh } = await useFetch<{ rows: RankRow[] }>("/api/staff/decisions");
const rows = computed(() => data.value?.rows ?? []);
const faculty = useFacultyFilter();
const sortMode = ref<"decision" | "score">("decision");
const decisionOrder: Record<NonNullable<RankRow["decision"]>, number> = { PASSED: 0, RESERVE: 1, REJECTED: 2 };
const visibleRows = computed(() => {
  const filtered = rows.value.filter((row) => facultyMatches(row.faculty, faculty.value));
  // Рейтинг с сервера уже отсортирован по баллам; в смешанном режиме
  // меняем только порядок групп, сохраняя баллы внутри каждой из них.
  if (sortMode.value === "decision") {
    filtered.sort((a, b) => (a.decision === null ? 3 : decisionOrder[a.decision]) - (b.decision === null ? 3 : decisionOrder[b.decision]));
  }
  return filtered;
});
function cardUrl(id: string, stage?: FinalPart) {
  const query = new URLSearchParams({ from: "all", return: "decisions" });
  if (faculty.value) query.set("faculty", faculty.value);
  if (stage === "HOMEWORK" || stage === "INTERVIEW") query.set("stage", stage);
  return `/staff/applications/${id}?${query}#previous-reviews`;
}

const counts = computed(() => ({
  passed: visibleRows.value.filter((row) => row.decision === "PASSED").length,
  reserve: visibleRows.value.filter((row) => row.decision === "RESERVE").length,
  rejected: visibleRows.value.filter((row) => row.decision === "REJECTED").length,
  none: visibleRows.value.filter((row) => !row.decision).length,
  published: visibleRows.value.filter((row) => row.published).length,
}));

interface FinalComment { id: string; body: string; author: string; createdAt: string }
const openCommentsId = ref<string | null>(null);
const comments = ref<FinalComment[]>([]);
const loadingComments = ref(false);
const commentsError = ref("");
const commentDraft = ref("");
const commentAction = useAction("/api/staff/decisions/comment");

async function loadComments(applicationId: string) {
  loadingComments.value = true;
  commentsError.value = "";
  try {
    const result = await $fetch<{ comments: FinalComment[] }>("/api/staff/decisions/comments", { query: { applicationId } });
    if (openCommentsId.value === applicationId) comments.value = result.comments;
  } catch {
    commentsError.value = "Не удалось загрузить комментарии. Попробуйте открыть их ещё раз.";
  } finally {
    loadingComments.value = false;
  }
}

async function toggleComments(row: RankRow) {
  if (openCommentsId.value === row.id) {
    openCommentsId.value = null;
    return;
  }
  openCommentsId.value = row.id;
  comments.value = [];
  commentDraft.value = "";
  commentAction.result.value = null;
  await loadComments(row.id);
}

async function addComment(row: RankRow) {
  const body = commentDraft.value.trim();
  if (!body || body.length > 1200) return;
  const result = await commentAction.submit({ applicationId: row.id, body });
  if (!result.ok) return;
  commentDraft.value = "";
  await Promise.all([loadComments(row.id), refresh()]);
}

const setOne = useAction("/api/staff/decisions/set");
async function decide(row: RankRow, outcome: "PASSED" | "RESERVE" | "REJECTED") {
  if (row.published) return;
  const next = row.decision === outcome ? null : outcome;
  row.decision = next;
  const result = await setOne.submit({ applicationId: row.id, outcome: next });
  if (!result.ok) await refresh();
}

const promote = useAction("/api/staff/decisions/promote");
const promotingId = ref<string | null>(null);
const confirmPromoteId = ref<string | null>(null);
async function promoteOne(row: RankRow) {
  if (!row.published || row.decision !== "RESERVE") return;
  promotingId.value = row.id;
  const result = await promote.submit({ applicationId: row.id });
  promotingId.value = null;
  confirmPromoteId.value = null;
  if (result.ok) await refresh();
}

const threshold = ref<number | null>(null);
const bulk = useAction("/api/staff/decisions/bulk");
async function applyThreshold() {
  if (threshold.value === null) return;
  const result = await bulk.submit({ threshold: threshold.value });
  if (result.ok) await refresh();
}

const parts = computed(() => rows.value[0]?.parts?.map((part) => part.stage) ?? []);
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <div class="flex flex-col gap-1">
      <h1 class="font-display text-3xl">Итоги отбора</h1>
      <p class="text-ink-soft max-w-2xl text-sm">
        Отсева между этапами нет: все, кто отправил анкету, проходят ДЗ, центр оценки и собеседование. Здесь — одно
        решение в конце. Итог — сумма средних баллов этапов. Отметки пока остаются черновиками: публикация результатов
        временно отключена. Резерв виден только организаторам.
      </p>
    </div>

    <!-- Сводка и действия -->
    <section class="bg-card border-line grid items-center gap-4 rounded-3xl border p-4 sm:p-5 lg:grid-cols-[1fr_auto]">
      <!-- Счётчики — плитками, число и подпись по центру плитки. -->
      <dl class="grid grid-cols-2 content-center gap-2 sm:grid-cols-5">
        <div
          v-for="tile in [
            { label: 'Проходят', value: counts.passed, tone: 'text-ok' },
            { label: 'Резерв (только для нас)', value: counts.reserve, tone: 'text-amber-700' },
            { label: 'Не проходят', value: counts.rejected, tone: 'text-danger' },
            { label: 'Без решения', value: counts.none, tone: '' },
            { label: 'Опубликовано', value: counts.published, tone: '' },
          ]"
          :key="tile.label"
          class="bg-paper flex flex-col-reverse items-center justify-center gap-1 rounded-2xl px-2 py-3 text-center"
        >
          <dt class="text-ink-soft text-xs">{{ tile.label }}</dt>
          <dd class="font-display text-2xl leading-none" :class="tile.tone">{{ tile.value }}</dd>
        </div>
      </dl>

      <div class="flex flex-col gap-2 sm:flex-row sm:items-end lg:flex-col lg:items-stretch">
        <form class="flex items-end gap-2" @submit.prevent="applyThreshold">
          <label class="flex flex-col gap-1 text-xs font-medium">
            Проходят от итога
            <input
              v-model.number="threshold"
              type="number"
              min="0"
              step="0.5"
              inputmode="decimal"
              class="border-line bg-paper min-h-11 w-28 rounded-xl border px-3 text-base"
            >
          </label>
          <UiButton type="submit" variant="ghost" class="min-h-11 w-auto px-4 text-sm" :pending="bulk.pending.value" :disabled="threshold === null">
            Применить
          </UiButton>
        </form>

        <div class="flex flex-col gap-1">
          <a href="/api/staff/decisions/export" download="sha-final-lists.xlsx" class="border-line bg-card hover:border-accent inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold">
            <FileSpreadsheet class="size-4" aria-hidden="true" /> Скачать Excel: берём и резерв
          </a>
          <span class="text-ink-soft text-xs">Все факультеты, включая черновики.</span>
        </div>

      </div>
    </section>
    <UiNotice v-if="promote.result.value" :ok="promote.result.value.ok" :message="promote.result.value.message" />

    <UiNotice v-if="bulk.result.value" :ok="bulk.result.value.ok" :message="bulk.result.value.message" />

    <div class="flex flex-wrap items-center gap-3">
      <StaffFacultyFilter v-model="faculty" />
      <label class="flex flex-col gap-1 text-sm font-medium">
        Сортировка
        <UiSelect v-model="sortMode" size="md" aria-label="Сортировка итогов">
          <option value="decision">Берём → резерв → не берём · по баллам</option>
          <option value="score">Только по баллам</option>
        </UiSelect>
      </label>
      <span class="text-ink-soft text-sm">Показано {{ visibleRows.length }} из {{ rows.length }}</span>
      <span class="text-ink-soft text-xs">Порог применяется ко всем факультетам.</span>
    </div>

    <!-- Рейтинг -->
    <section class="bg-card border-line overflow-hidden rounded-3xl border">
      <div
        class="text-ink-soft border-line hidden gap-4 border-b px-4 py-2 text-xs font-semibold uppercase md:grid"
        :style="{ gridTemplateColumns: `40px 2fr repeat(${parts.length}, minmax(0, 0.7fr)) 1fr 300px` }"
      >
        <span>#</span><span>Кандидат</span>
        <span v-for="part in parts" :key="part" class="text-center">{{ PART_LABEL[part] }}</span>
        <span>Итог</span><span>Решение</span>
      </div>
      <ol>
        <li
          v-for="(row, index) in visibleRows"
          :key="row.id"
          class="border-line rank-row grid grid-cols-[32px_1fr] items-center gap-x-3 gap-y-2 border-t px-4 py-3 first:border-t-0 md:gap-4"
          :style="{ '--cols': `40px 2fr repeat(${parts.length}, minmax(0, 0.7fr)) 1fr 300px` }"
        >
          <span class="text-ink-soft text-sm">{{ index + 1 }}</span>
          <NuxtLink
            :to="cardUrl(row.id)"
            class="flex min-w-0 items-center gap-3 hover:underline"
          >
            <StaffAvatar :seed="row.id" :text="row.initials" />
            <span class="min-w-0">
              <span class="block truncate text-sm font-semibold">{{ row.name }}</span>
              <span class="text-ink-soft block truncate text-xs">{{ row.faculty || "Факультет не указан" }}</span>
              <span class="block text-xs" :class="row.assessmentPassed ? 'text-ok' : 'text-danger'">{{ row.assessmentPassed ? "ЦО пройден" : "ЦО не пройден" }}</span>
              <span v-if="row.telegramUsername" class="text-ink-soft block truncate text-xs">@{{ row.telegramUsername }}</span>
              <span v-if="row.latestComment" class="text-ink-soft mt-1 block truncate text-xs" :title="row.latestComment">💬 {{ row.latestComment }}</span>
            </span>
          </NuxtLink>
          <!-- Баллы этапов: на телефоне — строкой чипов, на компьютере — колонками. -->
          <span class="col-start-2 flex flex-wrap gap-1.5 md:contents">
            <NuxtLink
              v-for="part in row.parts ?? []"
              :key="part.stage"
              :to="cardUrl(row.id, part.stage)"
              class="bg-paper rounded-lg px-2 py-1 text-center text-xs hover:underline md:bg-transparent md:px-0 md:text-sm"
              :title="`${PART_LABEL[part.stage]}: ${part.average ?? 'нет оценки'} из ${part.max}`"
            >
              <span class="text-ink-soft md:hidden">{{ PART_LABEL[part.stage] }} </span>
              <b v-if="part.average !== null">{{ part.average }}</b><span v-else class="text-ink-soft">—</span>
              <span class="text-ink-soft">/{{ part.max }}</span>
            </NuxtLink>
          </span>
          <span class="col-start-2 flex flex-col gap-1 md:col-start-auto">
            <span class="text-sm"><b>{{ row.average ?? "—" }}</b><span class="text-ink-soft"> / {{ row.max }}</span></span>
            <span class="text-ink-soft text-xs">проверено {{ row.reviewed }} из {{ row.reviewers }}</span>
            <span v-if="row.markers.length" class="flex flex-wrap gap-1">
              <span v-for="marker in row.markers" :key="marker" class="bg-brand-purple-soft/60 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-[#6a1a91]">{{ marker }}</span>
            </span>
          </span>
          <div class="col-start-2 flex flex-wrap items-center gap-1.5 md:col-start-auto">
            <template v-if="row.published">
              <span
                class="flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
                :class="row.decision === 'PASSED' ? 'bg-brand-green-soft text-ok' : row.decision === 'RESERVE' ? 'bg-amber-100 text-amber-800' : 'bg-brand-red-soft text-danger'"
              >
                <Lock class="size-3.5" aria-hidden="true" />
                {{ row.decision === "PASSED" ? "Проходит" : row.decision === "RESERVE" ? "Резерв" : "Не проходит" }}
              </span>
              <template v-if="row.decision === 'RESERVE'">
                <template v-if="confirmPromoteId === row.id">
                  <span class="basis-full text-xs">Пригласить {{ row.name }} на освободившееся место? Ему придёт уведомление.</span>
                  <button type="button" class="min-h-10 rounded-xl bg-ok px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" :disabled="promote.pending.value" @click="promoteOne(row)">{{ promotingId === row.id ? "Переводим…" : "Подтвердить" }}</button>
                  <button type="button" class="min-h-10 rounded-xl border border-line px-3 py-2 text-sm" @click="confirmPromoteId = null">Отмена</button>
                </template>
                <button v-else type="button" class="min-h-10 rounded-xl border border-ok px-3 py-2 text-sm font-medium text-ok hover:bg-brand-green-soft" :aria-label="`Пригласить из резерва: ${row.name}`" @click="confirmPromoteId = row.id">Пригласить</button>
              </template>
            </template>
            <template v-else>
              <button
                type="button"
                :aria-pressed="row.decision === 'RESERVE'"
                class="flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl border text-sm font-medium transition"
                :class="row.decision === 'RESERVE' ? 'border-amber-700 bg-amber-100 text-amber-800' : 'border-line hover:border-amber-700/50'"
                @click="decide(row, 'RESERVE')"
              >
                <Clock3 class="size-4" aria-hidden="true" /> Резерв
              </button>
              <button
                type="button"
                :aria-pressed="row.decision === 'PASSED'"
                class="flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl border text-sm font-medium transition"
                :class="row.decision === 'PASSED' ? 'border-ok bg-brand-green-soft text-ok' : 'border-line hover:border-ok/50'"
                @click="decide(row, 'PASSED')"
              >
                <Check class="size-4" aria-hidden="true" /> Проходит
              </button>
              <button
                type="button"
                :aria-pressed="row.decision === 'REJECTED'"
                class="flex min-h-10 flex-1 items-center justify-center gap-1 rounded-xl border text-sm font-medium transition"
                :class="row.decision === 'REJECTED' ? 'border-danger bg-brand-red-soft text-danger' : 'border-line hover:border-danger/50'"
                @click="decide(row, 'REJECTED')"
              >
                <X class="size-4" aria-hidden="true" /> Нет
              </button>
            </template>
            <button
              type="button"
              class="border-line hover:border-accent flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-2 text-sm"
              :aria-expanded="openCommentsId === row.id"
              :aria-controls="`comments-${row.id}`"
              @click="toggleComments(row)"
            >
              <MessageSquareText class="size-4" aria-hidden="true" />
              {{ row.commentCount ? `Комментарии · ${row.commentCount}` : "Комментарий" }}
            </button>
          </div>
          <section v-if="openCommentsId === row.id" :id="`comments-${row.id}`" class="bg-paper col-span-full rounded-2xl p-4">
            <h3 class="font-semibold">Комментарии: {{ row.name }}</h3>
            <p class="text-ink-soft mt-1 text-xs">Видны только организаторам. Кандидату не отправляются.</p>
            <p v-if="loadingComments" class="text-ink-soft mt-3 text-sm">Загружаем комментарии…</p>
            <p v-if="commentsError" role="alert" class="text-danger mt-3 text-sm">{{ commentsError }}</p>
            <div v-else-if="!loadingComments" class="mt-3 flex flex-col gap-2">
              <p v-if="!comments.length" class="text-ink-soft text-sm">Комментариев пока нет.</p>
              <article v-for="comment in comments" :key="comment.id" class="border-line bg-card rounded-xl border p-3">
                <p class="text-ink-soft text-xs">{{ comment.author }} · {{ mskFormat(comment.createdAt, 'd MMM, HH:mm') }}</p>
                <p class="mt-1 whitespace-pre-wrap break-words text-sm">{{ comment.body }}</p>
              </article>
            </div>
            <form class="mt-4 flex flex-col gap-2" @submit.prevent="addComment(row)">
              <UiTextarea v-model="commentDraft" label="Новый комментарий" :rows="3" :max="1200" hint="Кратко о кандидате или причине решения" />
              <UiNotice v-if="commentAction.result.value" :ok="commentAction.result.value.ok" :message="commentAction.result.value.message" />
              <UiButton type="submit" class="self-start sm:w-auto" :pending="commentAction.pending.value" :disabled="!commentDraft.trim() || commentDraft.trim().length > 1200">Добавить комментарий</UiButton>
            </form>
          </section>
        </li>
      </ol>
      <p v-if="visibleRows.length === 0" class="text-ink-soft p-8 text-center text-sm">{{ rows.length ? 'По выбранному факультету кандидатов нет.' : 'Пока никто не отправил анкету.' }}</p>
    </section>
  </main>
</template>

<style scoped>
@media (min-width: 48rem) {
  .rank-row {
    grid-template-columns: var(--cols);
  }
}
</style>
