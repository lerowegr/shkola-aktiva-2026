<script setup lang="ts">
import type { ReviewHistory } from "~~/lib/applications/history";
const route = useRoute();
const details = ref<HTMLDetailsElement | null>(null);
onMounted(() => { if (route.hash === "#previous-reviews" && details.value) details.value.open = true; });
const props = defineProps<{ applicationId: string }>();
const { data, refresh, status, error } = await useFetch<ReviewHistory>(() => `/api/staff/applications/${props.applicationId}/history`, { immediate: false });
async function toggle(event: Event) { if ((event.target as HTMLDetailsElement).open && !data.value) await refresh(); }
</script>
<template>
  <details id="previous-reviews" ref="details" class="bg-card border-line rounded-3xl border p-4 sm:p-5" @toggle="toggle">
    <summary class="cursor-pointer font-semibold">Предыдущие оценки и комментарии</summary>
    <p v-if="status === 'pending'" class="text-ink-soft mt-3 text-sm">Загружаем оценки…</p>
    <p v-if="error" class="text-danger mt-3 text-sm">Не удалось открыть предыдущие оценки.</p>
    <div v-if="data" class="mt-4 flex flex-col gap-5">
      <section v-for="stage in data.stages" :key="stage.label" class="flex min-w-0 flex-col gap-3">
        <h3 class="font-display text-lg">{{ stage.label }}</h3>
        <p v-if="!stage.reviews.length" class="text-ink-soft text-sm">Оценок пока нет.</p>
        <article v-for="(review, i) in stage.reviews" :key="i" class="bg-paper flex min-w-0 flex-col gap-3 rounded-2xl p-3 break-words">
          <p class="text-sm font-semibold">{{ review.reviewer }} · {{ review.total ?? '—' }}/{{ review.max }}<span v-if="review.percent !== null"> · {{ review.percent }}%</span><span v-else class="text-ink-soft font-normal"> · оценка не завершена</span></p>
          <ul class="flex flex-col gap-2 text-sm"><li v-for="(criterion, j) in review.criteria" :key="j"><p>{{ criterion.title }}: <strong>{{ criterion.score ?? '—' }}/{{ criterion.max }}</strong></p><p v-if="criterion.comment" class="text-ink-soft whitespace-pre-line">{{ criterion.comment }}</p></li></ul>
          <p v-for="(marker, j) in review.markers" :key="j" class="text-sm whitespace-pre-line"><strong>{{ marker.title }}:</strong> {{ marker.note }}</p>
          <p v-if="review.comment" class="border-line border-t pt-2 text-sm whitespace-pre-line"><strong>Комментарий:</strong> {{ review.comment }}</p>
        </article>
      </section>
    </div>
  </details>
</template>
