<script setup lang="ts">
import {
  ChartColumn,
  ClipboardCheck,
  FileText,
  Gavel,
  Lock,
  MessageSquare,
  Mic,
  UsersRound,
  Settings2,
  UserCheck,
} from "lucide-vue-next";

/**
 * Оболочка кабинета организатора: шапка и вкладки, как в «Кабинете
 * мастера отбора». Вкладки этапа, который ещё не начался, — под замком.
 * «Сообщения» откроются вместе с ботом на следующем этапе разработки.
 */
const { data: nav } = await useFetch("/api/staff/nav", { key: "staff-nav" });
const route = useRoute();

const tabs = computed(() => {
  const value = nav.value;
  if (!value) return [];
  return [
    { to: "/staff", label: "Мои анкеты", icon: UserCheck, show: value.can.review, locked: value.stages.APPLICATION === "upcoming", badge: value.todo },
    { to: "/staff/all", label: "Все анкеты", icon: FileText, show: value.can.viewAll, locked: value.stages.APPLICATION === "upcoming", badge: 0 },
    { to: "/staff/messages", label: "Сообщения", icon: MessageSquare, show: value.can.messages, locked: false, badge: value.messages },
    { to: "/staff/homework", label: "Оценка ДЗ", icon: ClipboardCheck, show: value.can.review || value.can.viewAll, locked: value.stages.HOMEWORK === "upcoming", badge: value.homeworkTodo },
    // Распределяющим вкладка открыта заранее — собрать группы до старта этапа.
    {
      to: "/staff/assessment",
      label: "Центр оценки",
      icon: UsersRound,
      show: value.can.review || value.can.assign,
      locked: value.stages.ASSESSMENT === "upcoming" && !value.can.assign,
      badge: value.assessmentTodo,
    },
    // Ведущим собеседования вкладка открыта заранее — нарезать слоты до старта этапа.
    { to: "/staff/interviews", label: "Собеседования", icon: Mic, show: true, locked: value.stages.INTERVIEW === "upcoming" && !value.can.interviews, badge: 0 },
    { to: "/staff/decisions", label: "Решения", icon: Gavel, show: value.can.decide, locked: false, badge: 0 },
    { to: "/staff/dashboards", label: "Дашборды", icon: ChartColumn, show: value.can.dashboards, locked: false, badge: 0 },
    {
      to: "/staff/admin",
      label: "Админка",
      icon: Settings2,
      show:
        value.can.stages || value.can.team || value.can.roles || value.can.forms || value.can.content || value.can.broadcast || value.can.audit,
      locked: false,
      badge: 0,
    },
  ].filter((tab) => tab.show);
});

// На телефоне вкладки не влезают: открытая не должна прятаться за краем.
const tabsNav = ref<HTMLElement | null>(null);
function revealActive() {
  tabsNav.value?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
}
onMounted(revealActive);
watch(() => route.path, () => nextTick(revealActive));

function active(to: string) {
  if (to === "/staff") return route.path === "/staff";
  if (to === "/staff/admin") return route.path.startsWith("/staff/admin") || route.path === "/staff/stages";
  if (to === "/staff/all") return route.path === "/staff/all";
  return route.path.startsWith(to);
}
</script>

<template>
  <div class="min-h-dvh">
    <AppHeader>
      <nav ref="tabsNav" class="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2" aria-label="Разделы кабинета">
        <template v-for="tab in tabs" :key="tab.to">
          <span
            v-if="tab.locked"
            class="text-paper/40 flex min-h-11 shrink-0 cursor-not-allowed items-center gap-2 border-b-2 border-transparent px-3 text-sm"
            title="Откроется на следующем этапе"
          >
            <component :is="tab.icon" class="size-4" aria-hidden="true" />
            {{ tab.label }}
            <Lock class="size-3.5" aria-label="откроется позже" />
          </span>
          <NuxtLink
            v-else
            :to="tab.to"
            class="flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-medium transition"
            :class="active(tab.to) ? 'border-brand-green text-paper' : 'text-paper/65 hover:text-paper border-transparent'"
            :aria-current="active(tab.to) ? 'page' : undefined"
          >
            <component :is="tab.icon" class="size-4" aria-hidden="true" />
            {{ tab.label }}
            <span
              v-if="tab.badge > 0"
              class="bg-brand-green-soft text-ink grid min-w-5 place-items-center rounded-full px-1.5 text-xs font-semibold"
            >
              {{ tab.badge }}
            </span>
          </NuxtLink>
        </template>
      </nav>
    </AppHeader>

    <slot />
  </div>
</template>
