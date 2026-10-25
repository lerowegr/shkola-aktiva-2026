<script setup lang="ts">
import type { CandidateAssessment } from "~~/lib/assessment/candidate";

/**
 * Центр оценки: что это за этап и приглашение на сбор с ответом —
 * «буду», «в резервный день», «не получится». Подгрупп кандидат не видит.
 */
useHead({ title: "Центр оценки" });

const { data, refresh } = await useFetch<{ assessment: CandidateAssessment | null }>("/api/cabinet/assessment");
const co = computed(() => data.value?.assessment ?? null);
</script>

<template>
  <div>
    <AppHeader />
    <main class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
      <div class="flex flex-col gap-1">
        <NuxtLink to="/cabinet" class="text-ink-soft hover:text-ink text-sm">← Кабинет</NuxtLink>
        <h1 class="font-display text-3xl">{{ co?.title ?? "Центр оценки" }}</h1>
      </div>

      <p v-if="!co" class="bg-card border-line rounded-3xl border p-5 text-sm">
        Центр оценки откроется после отправки анкеты с домашним заданием.
      </p>
      <AppAssessmentCard v-else :co="co" @changed="refresh" />
    </main>
  </div>
</template>
