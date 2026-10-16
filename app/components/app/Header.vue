<script setup lang="ts">
import { LogOut } from "lucide-vue-next";

/** Шапка кабинетов: знак ША, кто вошёл, выход. */
const user = await useSession();
const Link = resolveComponent("NuxtLink");
</script>

<template>
  <header class="bg-ink text-paper">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
      <NuxtLink to="/" class="flex items-center gap-2 font-display text-sm">
        <span class="bg-lime text-ink grid size-8 place-items-center rounded-lg leading-none">ША</span>
        <span class="hidden sm:inline">Школа Актива</span>
      </NuxtLink>

      <div v-if="user" class="flex min-w-0 items-center gap-2 sm:gap-3">
        <AppNotificationBell />
        <!-- Организатору имя — вход в его кабинет. -->
        <component
          :is="user.isStaff ? Link : 'div'"
          v-bind="user.isStaff ? { to: '/staff/me', 'aria-label': 'Мой кабинет' } : {}"
          class="min-w-0 rounded-lg px-1 text-right"
          :class="user.isStaff && 'hover:bg-white/10'"
        >
          <p class="truncate text-sm font-semibold">{{ user.name }}</p>
          <p class="text-paper/60 text-xs">{{ user.isStaff ? "Организатор · мой кабинет" : "Кандидат" }}</p>
        </component>
        <button
          type="button"
          class="text-paper/70 hover:text-paper grid size-10 shrink-0 place-items-center rounded-xl hover:bg-white/10"
          aria-label="Выйти"
          @click="signOut"
        >
          <LogOut class="size-5" aria-hidden="true" />
        </button>
      </div>
    </div>
    <slot />
  </header>
</template>
