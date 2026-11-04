<script setup lang="ts">
import { ExternalLink, RefreshCw, TriangleAlert } from "lucide-vue-next";

import type { EvaluatedStage } from "~~/lib/applications/staff";
import type { DashboardPayload } from "~~/lib/dashboards";
import { COURSES } from "~~/lib/profile/onboarding";

/**
 * «Дашборды»: как идёт набор. Сверху — оперативные отчёты для дней
 * собеседований, ниже — качество оценок, итоги и разрезы. Все фильтры
 * живут в адресе страницы, поэтому ссылкой можно поделиться.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Дашборды" });

const route = useRoute();
const router = useRouter();

function useQueryState(key: string) {
  return computed<string>({
    get: () => (typeof route.query[key] === "string" ? route.query[key] : ""),
    set: (value) => void router.replace({ query: { ...route.query, [key]: value || undefined } }),
  });
}

const faculty = useFacultyFilter();
const course = useQueryState("course");
const source = useQueryState("source");
const day = useQueryState("day");
const building = useQueryState("building");
const master = useQueryState("master");
const from = useQueryState("from");
const to = useQueryState("to");
const assessmentDay = ref("");
const interviewDay = ref("");

const { data, status, error, refresh } = await useFetch<DashboardPayload>("/api/staff/dashboards", {
  query: { faculty, course, source, day, assessmentDay, interviewDay, building, master, from, to },
});
const updatedAt = ref(new Date());
async function reload() {
  await refresh();
  updatedAt.value = new Date();
}

// Оперативный блок обновляется сам, но только когда вкладка на экране.
let timer: ReturnType<typeof setInterval> | undefined;
onMounted(() => {
  timer = setInterval(() => {
    if (document.visibilityState === "visible") void reload();
  }, 30000);
});
onBeforeUnmount(() => clearInterval(timer));

const csvUrl = (report: string) =>
  `/api/staff/dashboards/export?report=${report}&faculty=${encodeURIComponent(faculty.value)}&course=${encodeURIComponent(course.value)}&day=${encodeURIComponent(day.value)}`;

const step = (key: string) => data.value?.funnel.find((item) => item.key === key)?.count ?? 0;
const fmt1 = (value: number | null | undefined) => (value == null ? "—" : String(Math.round(value * 10) / 10));

// ── Сейчас ──
const dayOptions = ref([{ value: "", label: "Сегодня" }]);
onMounted(() => {
  const key = (offset: number) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date(Date.now() + offset * 86400000));
  dayOptions.value = [
    { value: "", label: "Сегодня" },
    { value: key(1), label: "Завтра" },
    { value: key(2), label: "Послезавтра" },
  ];
});
const nowBoard = computed(() => data.value?.today);
const placeRows = computed(() =>
  (nowBoard.value?.places ?? []).map((row) => ({
    place: row.location,
    slots: row.slots,
    booked: row.booked,
    free: Math.max(0, row.slots - row.booked),
  })),
);
const upcomingRows = computed(() =>
  (nowBoard.value?.upcoming ?? []).map((row) => ({
    time: row.time,
    candidate: row.candidate,
    place: row.room ? `${row.location}, ${row.room}` : row.location,
    status: row.started ? "началась" : "скоро",
  })),
);
const daySlots = computed(() => {
  const rows = placeRows.value;
  return {
    slots: rows.reduce((sum, row) => sum + row.slots, 0),
    booked: rows.reduce((sum, row) => sum + row.booked, 0),
    free: rows.reduce((sum, row) => sum + row.free, 0),
  };
});

// ── Места и переписка ──
const seatRows = computed(() =>
  (data.value?.seats.rows ?? []).map((row) => ({
    day: shortDay(row.day),
    place: row.location,
    slots: row.slots,
    booked: row.booked,
    free: Math.max(0, row.slots - row.booked),
  })),
);
const backlogRows = computed(() =>
  (data.value?.backlog.rows ?? []).map((row) => ({
    name: row.name,
    faculty: row.faculty ?? "Не указан",
    waiting: `${row.waitingHours} ч`,
    lastByStaff: row.lastByStaff ?? "ответа не было",
  })),
);

// ── Воронка ──
const funnelRows = computed(() => {
  const steps = data.value?.funnel ?? [];
  const first = steps[0]?.count ?? 0;
  return steps.map((item, i) => {
    const previous = steps[i - 1];
    return {
      label: item.label,
      value: item.count,
      share: i ? percentOf(item.count, first) : undefined,
      hint: previous ? `${percentOf(item.count, previous.count)} от шага «${previous.label}»` : undefined,
    };
  });
});
const sliceLabels = computed(() => {
  const parts: string[] = [];
  if (faculty.value) parts.push(faculty.value === "none" ? "факультет не указан" : faculty.value);
  if (course.value) parts.push(`${course.value} курс`);
  if (source.value) parts.push(`«${source.value}»`);
  return parts.length ? parts.join(" · ") : null;
});

const waiting = computed(() => data.value?.waiting);
const names = (rows: { name: string }[]) =>
  rows.slice(0, 8).map((row) => row.name).join(", ") + (rows.length > 8 ? ` и ещё ${rows.length - 8}` : "");

// ── Качество оценок ──
const STAGES: { key: EvaluatedStage; label: string }[] = [
  { key: "APPLICATION", label: "Анкета" },
  { key: "HOMEWORK", label: "Домашнее задание" },
  { key: "INTERVIEW", label: "Собеседование" },
];
const qualityStage = ref<EvaluatedStage>("INTERVIEW");
const speedStats = computed(() => {
  const speed = data.value?.speed;
  if (!speed) return [];
  const rows = speed.stages.map((stage) => ({
    label: `Оценка: ${STAGES.find((item) => item.key === stage.stage)?.label}`,
    value: stage.medianMinutes === null ? "—" : `${fmt1(stage.medianMinutes)} мин`,
    note: stage.samples ? `у ${formatCount(stage.samples)} кандидатов` : "пока нет оценок",
  }));
  rows.push({
    label: "От записи до собеседования",
    value: speed.bookingLeadHours === null ? "—" : `${fmt1(speed.bookingLeadHours)} ч`,
    note: speed.bookingSamples ? `у ${formatCount(speed.bookingSamples)} записей` : "пока нет записей",
  });
  return rows;
});
const agreementRows = computed(() => {
  const criteria = data.value?.agreement[qualityStage.value] ?? [];
  return criteria
    .flatMap((criterion) =>
      criterion.reviewers.map((reviewer) => {
        const dev = Math.round((reviewer.mean - (criterion.overall ?? reviewer.mean)) * 10) / 10;
        return {
          criterion: criterion.title,
          overall: fmt1(criterion.overall),
          name: reviewer.name,
          mean: fmt1(reviewer.mean),
          dev: dev > 0 ? `+${dev}` : String(dev),
          n: reviewer.n,
        };
      }),
    )
    .sort((a, b) => Math.abs(Number(b.dev)) - Math.abs(Number(a.dev)) || a.criterion.localeCompare(b.criterion, "ru"));
});
const gapRows = computed(() =>
  (data.value?.gaps ?? []).map((row) => ({
    name: row.name,
    faculty: row.faculty ?? "Не указан",
    application: row.application === null ? "—" : `${row.application}%`,
    homework: row.homework === null ? "—" : `${row.homework}%`,
    assessment: row.assessment === null ? "—" : `${row.assessment}%`,
    interview: row.interview === null ? "—" : `${row.interview}%`,
    gap: row.gap > 0 ? `+${row.gap}` : String(row.gap),
  })),
);

// ── Итоги ──
const PART_LABELS: Record<string, string> = { APPLICATION: "Анкета", HOMEWORK: "ДЗ", ASSESSMENT: "ЦО", INTERVIEW: "Собеседование" };
const finalPartRows = computed(() =>
  (data.value?.final.stageMeans ?? []).map((part) => ({
    stage: PART_LABELS[part.stage] ?? part.stage,
    mean: fmt1(part.mean),
    max: part.max,
  })),
);
const facultyRows = computed(() =>
  (data.value?.faculties ?? []).map((row) => ({
    faculty: row.faculty ?? "Не указан",
    submitted: row.submitted,
    accepted: row.accepted,
    rejected: row.rejected,
    pending: row.pending,
    mean: fmt1(row.meanFinal),
  })),
);

// ── Существующие блоки ──
const days = computed(() => data.value?.daily ?? []);
const weekRegistered = computed(() => days.value.slice(-7).reduce((sum, day) => sum + day.registered, 0));
const dailySeries = computed(() => [
  { name: "Новые входы", color: "var(--color-brand-blue)", values: days.value.map((day) => day.registered) },
  { name: "Отправленные анкеты", color: "var(--color-brand-orange)", values: days.value.map((day) => day.submitted) },
]);
const assessmentSeries = computed(() => [
  { name: "Пришли", color: "var(--color-brand-blue)", values: data.value?.assessment.days.map(d => d.attended) ?? [] },
  { name: "Нет отметки явки", color: "var(--color-brand-orange)", values: data.value?.assessment.days.map(d => d.missed) ?? [] },
  { name: "День ещё не завершён", color: "var(--color-line)", values: data.value?.assessment.days.map(d => d.pending) ?? [] },
]);
const stage = ref<EvaluatedStage>("APPLICATION");
const stats = computed(() => data.value?.stages[stage.value]);
const progress = (key: EvaluatedStage) => {
  const reviewers = data.value?.stages[key].reviewers ?? [];
  return {
    done: reviewers.reduce((sum, row) => sum + row.done, 0),
    assigned: reviewers.reduce((sum, row) => sum + row.assigned, 0),
  };
};
const applicationProgress = computed(() => progress("APPLICATION"));
const submitted = computed(() => step("submitted"));
const channels = computed(() => data.value?.channels);
const CHANNEL_LABELS = { TELEGRAM: "Telegram", PUSH: "Пуши" } as const;
const DELIVERY_STATUSES = [
  { key: "sent", label: "Ушло" },
  { key: "skipped", label: "Пропущено" },
  { key: "failed", label: "Не дошло" },
  { key: "pending", label: "В очереди" },
] as const;
const CATEGORY_LABELS: Record<string, string> = { SELECTION: "Отбор", MESSAGES: "Сообщения", REVIEW: "Оценка", SYSTEM: "Важное" };
const deliveryDays = computed(() => data.value?.deliveries.days ?? []);
const deliverySeries = computed(() => [
  { name: "Ушло", color: "var(--color-brand-blue)", values: deliveryDays.value.map((row) => row.sent) },
  { name: "Не дошло", color: "var(--color-danger)", values: deliveryDays.value.map((row) => row.failed) },
]);
const deliveryCategoryRows = computed(() =>
  (data.value?.deliveries.categories ?? []).map((row) => ({
    category: CATEGORY_LABELS[row.category] ?? row.category,
    created: row.created,
    sent: row.sent,
    failed: row.failed,
  })),
);
const activity = computed(() => data.value?.activity);

// ── Прохождение по дням и радуга факультетов ──
const cumulative = ref(false);
const METRIC_COLORS: Record<string, string> = {
  submitted: "#1c63ff",
  assessment: "#ff8511",
  interviews: "#2ce718",
  accepted: "#be2aff",
};
const FACULTY_COLORS: Record<string, string> = {
  "МЭО": "#1c63ff",
  "СНиМК": "#2ce718",
  "ВШУ": "#be2aff",
  "НАБ": "#ff8511",
  "ИТиАБД": "#ffcc00",
  "ФЭБ": "#f60301",
  "ЮФ": "#00b8d9",
  "ФФ": "#ff5ca8",
  "Не указан": "#9aa3b5",
};
const courseOptions = computed(() => [
  { value: "", label: "Все курсы" },
  ...COURSES.map((value) => ({ value, label: `${value} курс` })),
]);
const sourceOptions = computed(() => [
  { value: "", label: "Все источники" },
  ...(data.value?.sourceOptions ?? []).map((option) => ({ value: option, label: option })),
]);
const masterOptions = computed(() => [
  { value: "", label: "Все мастера" },
  ...(data.value?.masters ?? []).map((item) => ({ value: item.id, label: item.name })),
]);
const buildingSelectOptions = computed(() => [
  { value: "", label: "Все корпуса" },
  ...buildingOptions.value.map((name) => ({ value: name, label: name })),
]);

const milestoneDays = computed(() => data.value?.milestones.days ?? []);
const cumulate = (key: "submitted" | "assessment" | "interviews" | "accepted") => {
  let sum = 0;
  return milestoneDays.value.map((row) => (sum += row[key]));
};
const MILESTONES = [
  ["submitted", "Отправили анкету"],
  ["assessment", "Пришли на ЦО"],
  ["interviews", "Собеседования"],
  ["accepted", "Приняты"],
] as const;
const milestoneSeries = computed(() =>
  MILESTONES.map(([key, label]) => ({
    name: label,
    color: METRIC_COLORS[key] ?? "#1c63ff",
    values: cumulative.value ? cumulate(key) : milestoneDays.value.map((row) => row[key]),
  })),
);
const milestoneLabels = computed(() => milestoneDays.value.map((row) => shortDay(row.day)));
const milestoneTableRows = computed(() =>
  milestoneDays.value.map((row) => ({
    day: shortDay(row.day),
    submitted: row.submitted,
    assessment: row.assessment,
    interviews: row.interviews,
    accepted: row.accepted,
  })),
);

const stageLabels = ["Анкета", "ЦО", "Собеседование", "Приняты"];
const rainbowSeries = computed(() =>
  (data.value?.milestones.faculties ?? []).map((row) => ({
    name: row.faculty ?? "Не указан",
    color: FACULTY_COLORS[row.faculty ?? "Не указан"] ?? "#9aa3b5",
    values: [row.submitted, row.assessment, row.interviews, row.accepted],
  })),
);
const buildingRows = computed(() => data.value?.milestones.buildings ?? []);
const buildingSeries = computed(() => [
  { name: "Явка на ЦО", color: "#ff8511", values: buildingRows.value.map((row) => row.assessment) },
  { name: "Собеседования", color: "#2ce718", values: buildingRows.value.map((row) => row.interviews) },
]);
const buildingOptions = computed(() => {
  const names = new Set<string>();
  for (const row of buildingRows.value) names.add(row.building);
  for (const row of data.value?.seats.rows ?? []) names.add(row.location);
  return [...names].sort((a, b) => a.localeCompare(b, "ru"));
});
const buildingOk = (location: string) => !building.value || location === building.value;

// ── Мастера ──
const masterName = computed(() => data.value?.masters.find((item) => item.id === master.value)?.name);
const masterDayLabels = computed(() => (data.value?.masterDays ?? []).map((row) => shortDay(row.day)));
const masterSeries = computed(() => [
  { name: "Слотов", color: "#1c63ff", values: (data.value?.masterDays ?? []).map((row) => row.slots) },
  { name: "Записей", color: "#2ce718", values: (data.value?.masterDays ?? []).map((row) => row.booked) },
]);
const agreementBars = computed(() => {
  const criteria = data.value?.agreement[qualityStage.value] ?? [];
  return criteria
    .flatMap((criterion) =>
      criterion.reviewers
        .filter((reviewer) => !master.value || data.value?.masters.find((m) => m.id === master.value)?.name === reviewer.name)
        .map((reviewer) => ({
          label: `${criterion.title} · ${reviewer.name}`,
          value: Math.round((reviewer.mean - (criterion.overall ?? reviewer.mean)) * 10) / 10,
        })),
    )
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 12);
});

// ── Собеседования: столбики по дням ──
const seatDayLabels = computed(() => [...new Set((data.value?.seats.rows ?? []).map((row) => row.day))].sort());
const seatSeries = computed(() => [
  {
    name: "Записано",
    color: "#1c63ff",
    values: seatDayLabels.value.map((day) =>
      (data.value?.seats.rows ?? []).filter((row) => row.day === day && buildingOk(row.location)).reduce((sum, row) => sum + row.booked, 0),
    ),
  },
  {
    name: "Свободно",
    color: "#c9c9c2",
    values: seatDayLabels.value.map((day) =>
      (data.value?.seats.rows ?? [])
        .filter((row) => row.day === day && buildingOk(row.location))
        .reduce((sum, row) => sum + Math.max(0, row.slots - row.booked), 0),
    ),
  },
]);

// ── Итоги и вовлечённость графиками ──
const outcomeLabels = computed(() => (data.value?.faculties ?? []).map((row) => row.faculty ?? "Не указан"));
const outcomeSeries = computed(() => [
  { name: "Прошли", color: "#2ce718", values: (data.value?.faculties ?? []).map((row) => row.accepted) },
  { name: "Не прошли", color: "#f60301", values: (data.value?.faculties ?? []).map((row) => row.rejected) },
  { name: "Ждут итогов", color: "#c9c9c2", values: (data.value?.faculties ?? []).map((row) => row.pending) },
]);
const notBookedSeries = computed(() => [
  {
    name: "Не ответили на ЦО",
    color: "#ff8511",
    values: (data.value?.waiting.byFaculty ?? []).map((row) => row.assessment),
  },
  {
    name: "Не записались на собес",
    color: "#1c63ff",
    values: (data.value?.waiting.byFaculty ?? []).map((row) => row.interview),
  },
]);
const notBookedLabels = computed(() => (data.value?.waiting.byFaculty ?? []).map((row) => row.faculty ?? "Не указан"));
const stageMeanSeries = computed(() => [
  {
    name: "Средний балл",
    color: "#1c63ff",
    values: (data.value?.final.stageMeans ?? []).map((part) => part.mean ?? 0),
  },
]);
const stageMeanLabels = computed(() => (data.value?.final.stageMeans ?? []).map((part) => PART_LABELS[part.stage] ?? part.stage));
const engagementChart = computed(() => [
  {
    name: "Человек",
    color: "#1c63ff",
    values: (activity.value?.byStage ?? []).map((row) => row.total),
  },
  {
    name: "Из них играли",
    color: "#be2aff",
    values: (activity.value?.byStage ?? []).map((row) => row.players),
  },
]);
const engagementLabels = computed(() => (activity.value?.byStage ?? []).map((row) => row.label));

function time(date: Date) {
  return mskTime(date);
}
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h1 class="font-display text-3xl">Дашборды</h1>
        <p class="text-ink-soft text-sm">Как идёт набор в этом сезоне. Обновлено в {{ time(updatedAt) }}, само — каждые 30 секунд.</p>
      </div>
      <button
        type="button"
        class="border-line bg-card hover:border-ink-soft inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm disabled:opacity-50"
        :disabled="status === 'pending'"
        @click="reload"
      >
        <RefreshCw class="size-4" :class="{ 'animate-spin': status === 'pending' }" aria-hidden="true" />
        Обновить
      </button>
    </div>

    <nav aria-label="Разделы дашборда" class="text-ink-soft flex flex-wrap gap-x-4 gap-y-1 text-sm">
      <a
v-for="item in [
        ['now', 'Сейчас'], ['flow', 'Прохождение'], ['faculties', 'Факультеты'], ['masters', 'Мастера'],
        ['seats', 'Места'], ['backlog', 'Переписка'], ['funnel', 'Воронка'],
        ['waiting', 'Не записались'], ['quality', 'Оценки'], ['final', 'Итоги'], ['cuts', 'Разрезы'], ['channels', 'Каналы'],
      ]" :key="item[0]" class="hover:text-ink" :href="`#${item[0]}`">{{ item[1] }}</a>
    </nav>

    <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      <StaffFacultyFilter v-model="faculty" />
      <UiSelect v-model="course" aria-label="Курс" size="sm" class="sm:w-44" :options="courseOptions" />
      <UiSelect v-if="sourceOptions.length > 1" v-model="source" aria-label="Откуда узнали" size="sm" class="sm:w-64" :options="sourceOptions" />
      <UiSelect v-if="masterOptions.length > 1" v-model="master" aria-label="Мастер отбора" size="sm" class="sm:w-56" :options="masterOptions" />
      <UiSelect v-model="building" aria-label="Корпус" size="sm" class="sm:w-56" :options="buildingSelectOptions" />
      <UiDatePicker v-model="from" aria-label="Период с" placeholder="С даты" size="sm" />
      <UiDatePicker v-model="to" aria-label="Период по" placeholder="По дату" size="sm" />
    </div>

    <p v-if="error" role="alert" class="text-danger">Не удалось загрузить статистику. Попробуйте обновить страницу.</p>
    <div v-if="data" class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <DashStat
        label="Вошли на сайт"
        :value="formatCount(step('registered'))"
        :note="weekRegistered ? `+${formatCount(weekRegistered)} за 7 дней` : 'за 7 дней — никого'"
        :good="weekRegistered > 0"
      />
      <DashStat
        label="Отправили анкету"
        :value="formatCount(submitted)"
        :note="`из ${formatCount(step('started'))} начавших`"
      />
      <DashStat
        label="Проверено анкет"
        :value="percentOf(applicationProgress.done, applicationProgress.assigned)"
        :note="`${formatCount(applicationProgress.done)} из ${formatCount(applicationProgress.assigned)} оценок`"
      />
      <DashStat
        label="Прошли отбор"
        :value="formatCount(step('accepted'))"
        :note="step('accepted') ? 'итоги опубликованы' : 'итогов ещё нет'"
      />
    </div>
    <div v-if="data" class="flex flex-col gap-6 transition-opacity" :class="{ 'opacity-60': status === 'pending' }">
      <!-- 1. Сейчас -->
      <section id="now" class="scroll-mt-20 flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-2xl">Сейчас</h2>
          <UiSelect v-model="day" aria-label="День" size="sm" class="w-44" :options="dayOptions" />
        </div>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <DashStat
            label="Собеседования в этот день"
            :value="`${formatCount(daySlots.booked)} из ${formatCount(daySlots.slots)}`"
            :note="`${formatCount(daySlots.slots - daySlots.booked)} свободно`"
          />
          <DashStat
            label="ЦО: пришли"
            :value="formatCount(nowBoard?.assessment.attended ?? 0)"
            :note="`не явились: ${formatCount(nowBoard?.assessment.missed ?? 0)} · день не прошёл: ${formatCount(nowBoard?.assessment.pending ?? 0)}`"
          />
          <DashStat label="Отмены записей за день" :value="formatCount(nowBoard?.reschedules ?? 0)" note="переносы и отказы" />
          <DashStat
            label="Ждут ответа дольше 6 часов"
            :value="formatCount(nowBoard?.waiting ?? 0)"
            :note="nowBoard?.waiting ? 'загляните в переписку' : 'всё отвечено'"
            :good="!(nowBoard?.waiting ?? 0)"
          />
        </div>
        <div class="grid gap-6 lg:grid-cols-2">
          <DashCard title="Слоты по корпусам" hint="Записано кандидатов из активных записей этого дня.">
            <DashTable
              :columns="[
                { key: 'place', label: 'Корпус' },
                { key: 'slots', label: 'Слотов', align: 'right' },
                { key: 'booked', label: 'Записано', align: 'right' },
                { key: 'free', label: 'Свободно', align: 'right' },
              ]"
              :rows="placeRows"
              empty="На этот день слотов нет."
            />
          </DashCard>
          <DashCard title="Встречи дня" hint="Первые двенадцать по времени.">
            <DashTable
              :columns="[
                { key: 'time', label: 'Время' },
                { key: 'candidate', label: 'Кандидат' },
                { key: 'place', label: 'Место' },
                { key: 'status', label: 'Статус' },
              ]"
              :rows="upcomingRows"
              empty="Записей на этот день нет."
            />
          </DashCard>
        </div>
      </section>

      <!-- 1б. Прохождение по дням -->
      <section id="flow" class="scroll-mt-20 flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-2xl">Кто когда проходил</h2>
          <label class="flex items-center gap-2 text-sm">
            <input v-model="cumulative" type="checkbox" class="size-4" >
            Накопительно
          </label>
        </div>
        <DashCard title="Этапы отбора по дням" hint="По московским дням, за выбранный период. Фильтры факультета, курса и корпуса применяются.">
          <DashColumns v-if="milestoneDays.length" :labels="milestoneLabels" :series="milestoneSeries" caption="Отправка анкеты, явка на ЦО, собеседования и принятия по дням" />
          <p v-else class="text-ink-soft text-sm">За выбранный период событий нет.</p>
          <DashTable
            :columns="[
              { key: 'day', label: 'День' },
              { key: 'submitted', label: 'Анкеты', align: 'right' },
              { key: 'assessment', label: 'ЦО', align: 'right' },
              { key: 'interviews', label: 'Собеседования', align: 'right' },
              { key: 'accepted', label: 'Приняты', align: 'right' },
            ]"
            :rows="milestoneTableRows"
            empty="Событий пока нет."
          />
          <a class="text-sm underline" :href="csvUrl('flow')">Скачать CSV</a>
        </DashCard>
      </section>

      <!-- 1в. Факультеты -->
      <section id="faculties" class="scroll-mt-20 flex flex-col gap-4">
        <h2 class="font-display text-2xl">Факультеты</h2>
        <DashCard title="Все факультеты по этапам" hint="Сколько человек каждого факультета дошло до каждого события. Цвет факультета — свой на всех графиках.">
          <DashGroupedColumns
            :labels="stageLabels"
            :series="rainbowSeries"
            caption="Отправка анкеты, явка на ЦО, собеседования и принятия по факультетам"
          />
          <a class="text-sm underline" :href="csvUrl('faculties')">Скачать CSV</a>
        </DashCard>
        <div class="grid gap-6 lg:grid-cols-2">
          <DashCard title="По корпусам" hint="Явка на ЦО и собеседования по корпусам.">
            <DashGroupedColumns
              :labels="buildingRows.map((row) => row.building)"
              :series="buildingSeries"
              caption="ЦО и собеседования по корпусам"
            />
          </DashCard>
          <DashCard title="Не записавшиеся по факультетам" hint="Кто отправил анкету, но застрял: не ответил на ЦО или не записался на собеседование.">
            <DashGroupedColumns
              :labels="notBookedLabels"
              :series="notBookedSeries"
              caption="Не записавшиеся по факультетам"
            />
          </DashCard>
        </div>
      </section>

      <!-- 1г. Мастера -->
      <section id="masters" class="scroll-mt-20 flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-2xl">Мастера</h2>
          <p v-if="masterName" class="text-ink-soft text-sm">Выбран: <strong>{{ masterName }}</strong></p>
        </div>
        <DashCard title="Собеседования мастера по дням" hint="Слоты мастера и записи на них. Мастер выбирается фильтром сверху.">
          <DashGroupedColumns
            v-if="master && masterDayLabels.length"
            :labels="masterDayLabels"
            :series="masterSeries"
            caption="Слоты и записи мастера по дням"
            :values="true"
          />
          <p v-else class="text-ink-soft text-sm">Выберите мастера фильтром «Мастер отбора» — здесь появятся его слоты и записи по дням.</p>
        </DashCard>
        <DashCard title="Строже или мягче среднего" hint="Средний балл мастера против среднего по всем, кто ставил баллы за этот же критерий.">
          <div role="tablist" class="bg-paper border-line flex max-w-full flex-wrap gap-1 self-start rounded-2xl border p-1">
            <button
              v-for="item in STAGES"
              :key="item.key"
              type="button"
              role="tab"
              :aria-selected="qualityStage === item.key"
              class="rounded-xl px-3 py-1.5 text-sm whitespace-nowrap"
              :class="qualityStage === item.key ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'"
              @click="qualityStage = item.key"
            >
              {{ item.label }}
            </button>
          </div>
          <DashDivergingBars v-if="agreementBars.length" :rows="agreementBars" caption="Отклонение среднего балла мастера по критериям этапа." />
          <p v-else class="text-ink-soft text-sm">Баллов за этот этап ещё нет.</p>
        </DashCard>
      </section>

      <!-- 2. Свободные места -->
      <section id="seats" class="scroll-mt-20 flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-2xl">Свободные места на собеседования</h2>
          <a class="text-sm underline" :href="csvUrl('seats')">Скачать CSV</a>
        </div>
        <DashColumns
          v-if="seatDayLabels.length"
          :labels="seatDayLabels.map((day) => shortDay(day))"
          :series="seatSeries"
          caption="Записано и свободно по дням собеседований"
        />
        <DashTable
          :columns="[
            { key: 'day', label: 'День' },
            { key: 'place', label: 'Корпус' },
            { key: 'slots', label: 'Слотов', align: 'right' },
            { key: 'booked', label: 'Записано', align: 'right' },
            { key: 'free', label: 'Свободно', align: 'right' },
          ]"
          :rows="seatRows"
          empty="Слотов пока нет."
        />
        <p class="text-ink-soft text-sm">
          Отправили анкету, но не записались: <strong>{{ formatCount(data.seats.notBooked) }}</strong>, из них уже можно записываться (были на ЦО): <strong>{{ formatCount(data.seats.eligibleNotBooked) }}</strong>.
        </p>
      </section>

      <!-- 3. Переписка -->
      <section id="backlog" class="scroll-mt-20 flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-2xl">Долги по переписке</h2>
          <a class="text-sm underline" :href="csvUrl('backlog')">Скачать CSV</a>
        </div>
        <p class="text-ink-soft text-sm">
          Открытых переписок, где последнее слово за кандидатом: <strong>{{ formatCount(data.backlog.open) }}</strong>.
        </p>
        <div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <DashBarList :rows="data.backlog.buckets.map((bucket) => ({ label: bucket.label, value: bucket.count }))" />
          <DashTable
            :columns="[
              { key: 'name', label: 'Кандидат' },
              { key: 'faculty', label: 'Факультет' },
              { key: 'waiting', label: 'Ждёт', align: 'right' },
              { key: 'lastByStaff', label: 'Последний отвечал' },
            ]"
            :rows="backlogRows"
            empty="Все переписки отвечены."
            caption="До ста самых давних."
          />
        </div>
      </section>

      <!-- 4. Воронка со срезами -->
      <section id="funnel" class="scroll-mt-20 grid gap-6 lg:grid-cols-2">
        <DashCard title="Воронка отбора" :hint="sliceLabels ? `Срез: ${sliceLabels}. Доля — от вошедших в срезе.` : 'Сколько людей дошло до каждого шага; доля — от вошедших на сайт.'">
          <DashBarList :rows="funnelRows" />
          <a class="text-sm underline" :href="csvUrl('funnel')">Скачать CSV</a>
        </DashCard>

        <DashCard title="Заявки по дням" hint="За последние 30 дней, по московскому времени. Фильтры на воронку не влияют.">
          <DashLineChart
            :labels="days.map((day) => shortDay(day.day))"
            :series="dailySeries"
            caption="Новые входы и отправленные анкеты по дням за 30 дней"
          />
        </DashCard>
      </section>

      <!-- 5. Не записавшиеся -->
      <section id="waiting" class="scroll-mt-20 flex flex-col gap-4">
        <h2 class="font-display text-2xl">Не записавшиеся</h2>
        <div class="grid gap-6 md:grid-cols-2">
          <DashCard title="Не ответили на приглашение на ЦО" hint="Совпадает с сегментом рассылки «Отправили анкету, но не ответили на ЦО».">
            <p class="text-3xl font-semibold">{{ formatCount(waiting?.assessment.count ?? 0) }}</p>
            <p v-if="waiting?.assessment.count" class="text-ink-soft text-sm">{{ names(waiting.assessment.rows) }}</p>
            <NuxtLink
              v-if="waiting?.assessment.count"
              class="inline-flex items-center gap-1 text-sm underline"
              to="/staff/admin/broadcast?segment=no_assessment"
            >
              <ExternalLink class="size-4" aria-hidden="true" />
              Напомнить в рассылке
            </NuxtLink>
          </DashCard>
          <DashCard title="Были на ЦО, но не записались" hint="Совпадает с сегментом «Отправили анкету, но не записались на собеседование».">
            <p class="text-3xl font-semibold">{{ formatCount(waiting?.interview.count ?? 0) }}</p>
            <p v-if="waiting?.interview.count" class="text-ink-soft text-sm">{{ names(waiting.interview.rows) }}</p>
            <p v-if="waiting?.interview.rows[0]?.daysLeft != null" class="text-ink-soft text-sm">
              До последнего дня собеседований — {{ plural(waiting.interview.rows[0].daysLeft, ["остался день", "осталось дня", "осталось дней"]) }}.
            </p>
            <NuxtLink
              v-if="waiting?.interview.count"
              class="inline-flex items-center gap-1 text-sm underline"
              to="/staff/admin/broadcast?segment=not_booked"
            >
              <ExternalLink class="size-4" aria-hidden="true" />
              Напомнить в рассылке
            </NuxtLink>
          </DashCard>
        </div>
        <a class="text-sm underline" :href="csvUrl('not_booked')">Скачать CSV</a>
      </section>

      <!-- 6. Качество оценок -->
      <section id="quality" class="scroll-mt-20 flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-2xl">Качество оценок</h2>
          <a class="text-sm underline" :href="csvUrl('agreement')">CSV: согласованность</a>
        </div>
        <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <DashStat v-for="row in speedStats" :key="row.label" :label="row.label" :value="row.value" :note="row.note" />
        </div>
        <DashCard title="Согласованность мастеров по критериям" hint="Средний балл мастера против среднего по всем, кто ставил баллы за этот же критерий. Первые строки — самое большое отклонение.">
          <div role="tablist" class="bg-paper border-line flex max-w-full flex-wrap gap-1 self-start rounded-2xl border p-1">
            <button
              v-for="item in STAGES"
              :key="item.key"
              type="button"
              role="tab"
              :aria-selected="qualityStage === item.key"
              class="rounded-xl px-3 py-1.5 text-sm whitespace-nowrap"
              :class="qualityStage === item.key ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'"
              @click="qualityStage = item.key"
            >
              {{ item.label }}
            </button>
          </div>
          <DashDivergingBars v-if="agreementBars.length" :rows="agreementBars" caption="Отклонение по критериям этапа." />
          <DashTable
            :columns="[
              { key: 'criterion', label: 'Критерий' },
              { key: 'overall', label: 'Общий средний', align: 'right' },
              { key: 'name', label: 'Мастер' },
              { key: 'mean', label: 'Его средний', align: 'right' },
              { key: 'dev', label: 'Отклонение', align: 'right' },
              { key: 'n', label: 'Оценок', align: 'right' },
            ]"
            :rows="agreementRows"
            empty="Баллов за этот этап ещё нет."
          />
        </DashCard>
        <DashCard title="Расхождения анкеты и собеседования" hint="Доля баллов этапа от максимума. Большой разрыв — повод перепроверить перед публикацией итогов, а не переделывать балл.">
          <DashTable
            :columns="[
              { key: 'name', label: 'Кандидат' },
              { key: 'faculty', label: 'Факультет' },
              { key: 'application', label: 'Анкета', align: 'right' },
              { key: 'homework', label: 'ДЗ', align: 'right' },
              { key: 'assessment', label: 'ЦО', align: 'right' },
              { key: 'interview', label: 'Собес', align: 'right' },
              { key: 'gap', label: 'Разрыв', align: 'right' },
            ]"
            :rows="gapRows"
            empty="Нужны оценки и анкеты, и собеседования."
          />
          <a class="text-sm underline" :href="csvUrl('gaps')">CSV: разрывы и скорость</a>
        </DashCard>
      </section>

      <!-- 7. Итоги -->
      <section id="final" class="scroll-mt-20 flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-2xl">Итоги</h2>
          <a class="text-sm underline" :href="csvUrl('final')">CSV: баллы</a>
        </div>
        <div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div class="flex min-w-0 flex-col gap-2">
            <h3 class="text-sm font-medium">Распределение итоговых баллов</h3>
            <p v-if="!data.final.count" class="text-ink-soft text-sm">Итог посчитается, когда появятся оценки этапов.</p>
            <DashHistogram
              v-else
              :counts="data.final.histogram"
              :mean="data.final.mean"
              caption="Итог — сумма средних баллов этапов"
            />
          </div>
          <div class="flex min-w-0 flex-col gap-2">
            <h3 class="text-sm font-medium">Средний балл по этапам</h3>
            <DashGroupedColumns :labels="stageMeanLabels" :series="stageMeanSeries" caption="Средний балл этапа" :values="true" />
            <DashTable
              :columns="[
                { key: 'stage', label: 'Этап' },
                { key: 'mean', label: 'Средний', align: 'right' },
                { key: 'max', label: 'Максимум', align: 'right' },
              ]"
              :rows="finalPartRows"
            />
            <p class="text-ink-soft text-sm">
              Прошли: <strong>{{ formatCount(data.final.accepted) }}</strong> · не прошли: <strong>{{ formatCount(data.final.rejected) }}</strong>
            </p>
          </div>
        </div>
        <DashCard title="Итоги по факультетам" hint="Сколько от каждого факультета прошло, не прошло и ещё ждёт итогов.">
          <DashColumns
            v-if="outcomeLabels.length"
            :labels="outcomeLabels"
            :series="outcomeSeries"
            caption="Прошли, не прошли и ждут итогов по факультетам"
          />
          <DashTable
            :columns="[
              { key: 'faculty', label: 'Факультет' },
              { key: 'submitted', label: 'Отправили', align: 'right' },
              { key: 'accepted', label: 'Прошли', align: 'right' },
              { key: 'rejected', label: 'Не прошли', align: 'right' },
              { key: 'pending', label: 'Ждут', align: 'right' },
              { key: 'mean', label: 'Средний итог', align: 'right' },
            ]"
            :rows="facultyRows"
            empty="Пока нет отправленных анкет."
          />
          <a class="text-sm underline" :href="csvUrl('faculty')">CSV: по факультетам</a>
        </DashCard>
      </section>

      <!-- ЦО и собеседования (существующий блок) -->
      <DashCard title="ЦО и собеседования" hint="Фильтры ниже относятся только к этому блоку. Неявка не ограничивает оценку анкеты и ДЗ.">
        <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <UiSelect
v-model="assessmentDay" aria-label="День ЦО" size="sm" class="sm:w-52" :options="[
            { value: '', label: 'Все дни ЦО' },
            ...data.assessment.options.map((option) => ({ value: option.day, label: `${shortDay(option.day)}${option.reserve ? ' · резерв' : ''}` })),
          ]" />
          <UiSelect
v-model="interviewDay" aria-label="День собеседования" size="sm" class="sm:w-52" :options="[
            { value: '', label: 'Все дни собеседований' },
            ...data.interviews.options.map((option) => ({ value: option.day, label: shortDay(option.day) })),
          ]" />
        </div>
        <p class="text-ink-soft text-sm">«Нет отметки явки» — подтвердили участие, день прошёл, явка не отмечена. Отказавшиеся, неответившие и очередь резерва сюда не входят.</p>
        <div class="grid gap-6 lg:grid-cols-2">
          <div class="flex min-w-0 flex-col gap-3">
            <h3 class="font-semibold">Явка на ЦО по дням</h3>
            <DashColumns v-if="data.assessment.days.length" :labels="data.assessment.days.map(day => shortDay(day.day))" :series="assessmentSeries" caption="Явка на ЦО по московским дням" />
            <p v-else class="text-ink-soft text-sm">Сборы ЦО пока не созданы.</p>
          </div>
          <div class="flex min-w-0 flex-col gap-3">
            <h3 class="font-semibold">Путь пришедших на ЦО</h3>
            <p class="text-ink-soft text-sm">От пришедших — к записи, полной оценке собеседования и опубликованному принятию. При выборе дня собеседования учитывается запись на этот день.</p>
            <DashBarList :rows="data.assessment.conversion.map(step => ({ label: step.label, value: step.count }))" />
          </div>
        </div>
        <h3 class="font-semibold">Собеседования по дням</h3>
        <p class="text-ink-soft text-sm">Показаны активные записи. Полная оценка означает, что хотя бы один мастер заполнил все критерии; это не отметка явки.</p>
        <div v-if="data.interviews.days.length" class="border-line overflow-x-auto rounded-xl border">
          <table class="w-full text-sm tabular-nums">
            <thead><tr><th class="p-3 text-left">День</th><th class="p-3">Слотов</th><th class="p-3">Записались</th><th class="p-3">Оценены</th></tr></thead>
            <tbody><tr v-for="point in data.interviews.days" :key="point.day" class="border-line border-t"><th class="p-3 text-left font-normal">{{ shortDay(point.day) }}</th><td class="p-3 text-center">{{ point.slots }}</td><td class="p-3 text-center">{{ point.booked }}</td><td class="p-3 text-center">{{ point.scored }}</td></tr></tbody>
          </table>
        </div>
        <p v-else class="text-ink-soft text-sm">Слоты собеседований пока не созданы.</p>
      </DashCard>

      <!-- Проверка (существующий блок) -->
      <DashCard title="Проверка" hint="Сколько проверил каждый мастер и как его средний итог отличается от общего.">
        <div role="tablist" class="bg-paper border-line flex max-w-full flex-wrap gap-1 self-start rounded-2xl border p-1">
          <button
            v-for="item in STAGES"
            :id="`stage-tab-${item.key}`"
            :key="item.key"
            type="button"
            aria-controls="stage-review-panel"
            role="tab"
            :aria-selected="stage === item.key"
            class="rounded-xl px-3 py-1.5 text-sm whitespace-nowrap"
            :class="stage === item.key ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink'"
            @click="stage = item.key"
          >
            {{ item.label }}
            <span class="tabular-nums opacity-70">{{ progress(item.key).done }}/{{ progress(item.key).assigned }}</span>
          </button>
        </div>

        <Transition name="dash-stage" mode="out-in">
          <div
            id="stage-review-panel"
            :key="stage"
            role="tabpanel"
            :aria-labelledby="`stage-tab-${stage}`"
            class="min-h-16"
          >
            <p v-if="!stats?.reviewers.length" class="text-ink-soft text-sm">На этом этапе работы ещё не назначены.</p>
            <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <DashReviewers :reviewers="stats.reviewers" :overall="stats.overall" :max="stats.max" />
              <div class="flex min-w-0 flex-col gap-2">
                <h3 class="text-sm font-medium">Итоговые баллы проверенных работ</h3>
                <p v-if="!stats.histogram.some(Boolean)" class="text-ink-soft text-sm">
                  Пока ни одной полностью проверенной работы.
                </p>
                <DashHistogram
                  v-else
                  :counts="stats.histogram"
                  :mean="stats.overall"
                  :caption="`Распределение итоговых баллов, этап «${STAGES.find((item) => item.key === stage)?.label}»`"
                />
              </div>
            </div>
          </div>
        </Transition>
      </DashCard>

      <!-- Разрезы (существующий блок) -->
      <section id="cuts" class="scroll-mt-20 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <DashCard
          v-for="cut in data.breakdowns"
          :key="cut.question"
          :title="cut.question"
          :hint="`По отправленным анкетам; доля — от ${formatCount(submitted)}.`"
        >
          <p v-if="!submitted" class="text-ink-soft text-sm">Пока нет отправленных анкет.</p>
          <DashBarList
            v-else
            :rows="cut.rows.map((row) => ({ label: row.label, value: row.count, share: percentOf(row.count, submitted) }))"
          />
        </DashCard>
      </section>

      <!-- Каналы и вовлечённость -->
      <section id="channels" class="scroll-mt-20 flex flex-col gap-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="font-display text-2xl">Каналы и вовлечённость</h2>
          <a class="text-sm underline" :href="csvUrl('deliveries')">CSV: уведомления</a>
        </div>
        <div class="grid gap-6 lg:grid-cols-2">
          <DashCard v-if="channels" title="Куда доходят новости" hint="«Пропущено» — чаще всего уже прочитали на сайте, и дублировать не стали.">
            <div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div class="flex flex-col gap-1">
                <p class="text-ink-soft text-sm">Привязали Telegram</p>
                <p class="text-2xl font-semibold">{{ formatCount(channels.telegram) }}</p>
                <p class="text-ink-soft text-sm">{{ percentOf(channels.telegram, channels.candidates) }} кандидатов</p>
              </div>
              <div class="flex flex-col gap-1">
                <p class="text-ink-soft text-sm">Включили пуши</p>
                <p class="text-2xl font-semibold">{{ formatCount(channels.push) }}</p>
                <p class="text-ink-soft text-sm">{{ percentOf(channels.push, channels.candidates) }} кандидатов</p>
              </div>
            </div>
            <div class="border-line overflow-x-auto rounded-xl border">
              <table class="w-full text-sm tabular-nums">
                <thead class="bg-paper text-ink-soft text-left">
                  <tr>
                    <th class="px-3 py-2 font-normal">Доставки</th>
                    <th v-for="row in channels.deliveries" :key="row.channel" class="px-3 py-2 text-right font-normal">
                      {{ CHANNEL_LABELS[row.channel] }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="kind in DELIVERY_STATUSES" :key="kind.key" class="border-line border-t">
                    <td class="px-3 py-2">{{ kind.label }}</td>
                    <td
                      v-for="row in channels.deliveries"
                      :key="row.channel"
                      class="px-3 py-2 text-right"
                      :class="{ 'text-danger font-semibold': kind.key === 'failed' && row.failed }"
                    >
                      <span class="inline-flex items-center gap-1">
                        <TriangleAlert v-if="kind.key === 'failed' && row.failed" class="size-3.5" aria-hidden="true" />
                        {{ formatCount(row[kind.key]) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </DashCard>
          <DashCard title="Уведомления по дням" hint="За последние 14 дней, по московскому времени.">
            <DashLineChart
              :labels="deliveryDays.map((row) => shortDay(row.day))"
              :series="deliverySeries"
              caption="Доставки по дням: ушло и не дошло"
            />
            <DashTable
              :columns="[
                { key: 'category', label: 'Тема' },
                { key: 'created', label: 'Создано', align: 'right' },
                { key: 'sent', label: 'Ушло', align: 'right' },
                { key: 'failed', label: 'Не дошло', align: 'right' },
              ]"
              :rows="deliveryCategoryRows"
              empty="Уведомлений пока не было."
            />
          </DashCard>
        </div>
        <DashCard title="Вовлечённость" hint="Кто коротает ожидание в играх и тесте. Результаты игр на отбор не влияют и мастерам не видны.">
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div class="flex flex-col gap-1">
              <p class="text-ink-soft text-sm">Играли в мини-игры</p>
              <p class="text-2xl font-semibold">{{ formatCount(data.games.players) }}</p>
              <p class="text-ink-soft text-sm">{{ formatCount(data.games.plays) }} {{ plural(data.games.plays, ["партия", "партии", "партий"]) }}</p>
            </div>
            <div class="flex flex-col gap-1">
              <p class="text-ink-soft text-sm">Играли за 7 дней</p>
              <p class="text-2xl font-semibold">{{ formatCount(activity?.games.players7 ?? 0) }}</p>
              <p class="text-ink-soft text-sm">{{ formatCount(activity?.games.plays7 ?? 0) }} партий</p>
            </div>
            <div class="flex flex-col gap-1">
              <p class="text-ink-soft text-sm">Прошли «Тест про ША»</p>
              <p class="text-2xl font-semibold">{{ formatCount(activity?.quiz.takers ?? 0) }}</p>
              <p class="text-ink-soft text-sm">средний: {{ activity?.quiz.meanPercent == null ? "—" : `${activity.quiz.meanPercent}%` }}</p>
            </div>
            <div class="flex flex-col gap-1">
              <p class="text-ink-soft text-sm">Решали задание дня</p>
              <p class="text-2xl font-semibold">{{ formatCount(activity?.daily.solvers ?? 0) }}</p>
              <p class="text-ink-soft text-sm">{{ formatCount(activity?.daily.solvers7 ?? 0) }} за 7 дней</p>
            </div>
          </div>
          <DashGroupedColumns
            :labels="engagementLabels"
            :series="engagementChart"
            caption="Игроки по этапам отбора"
            :values="true"
          />
          <a class="text-sm underline" :href="csvUrl('engagement')">CSV: вовлечённость</a>
        </DashCard>
      </section>
    </div>
  </main>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .dash-stage-enter-active,
  .dash-stage-leave-active {
    transition:
      opacity 0.16s ease,
      transform 0.16s cubic-bezier(0.2, 0, 0, 1);
  }
  .dash-stage-enter-from {
    opacity: 0;
    transform: translateY(6px);
  }
  .dash-stage-leave-to {
    opacity: 0;
    transform: translateY(-4px);
  }
}
</style>
