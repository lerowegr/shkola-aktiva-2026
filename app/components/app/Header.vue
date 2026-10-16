<script setup lang="ts">
import { LogOut } from "lucide-vue-next";

/** Шапка кабинетов: знак ША, кто вошёл, выход. */
const user = await useSession();
</script>

<template>
  <header class="bg-ink text-paper">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
      <NuxtLink to="/" class="flex items-center gap-2 font-display text-sm">
        <AppMark class="size-8 rounded-lg text-sm" />
        <span class="hidden sm:inline">Школа Актива</span>
      </NuxtLink>

      <div v-if="user" class="flex min-w-0 items-center gap-2 sm:gap-3">
        <AppNotificationBell />
        <!-- Имя — вход в свой профиль: организатору — личный кабинет, кандидату — профиль. -->
        <NuxtLink
          :to="user.isStaff ? '/staff/me' : '/cabinet/profile'"
          :aria-label="user.isStaff ? 'Мой кабинет' : 'Мой профиль'"
          class="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1 text-right transition hover:bg-white/10"
        >
          <span class="min-w-0">
            <p class="truncate text-sm font-semibold">{{ user.name }}</p>
            <p class="text-paper/60 text-xs">{{ user.isStaff ? "Организатор · мой кабинет" : "Кандидат · профиль" }}</p>
          </span>
          <img v-if="user.avatar" :src="user.avatar" alt="" class="size-9 shrink-0 rounded-full object-cover">
        </NuxtLink>
        <button
          type="button"
          class="text-paper/70 hover:bg-danger focus-visible:bg-danger grid size-10 shrink-0 place-items-center rounded-xl transition hover:text-white"
          aria-label="Выйти из аккаунта"
          title="Выйти из аккаунта"
          @click="signOut"
        >
          <LogOut class="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
    <slot />
  </header>
</template>
