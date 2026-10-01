<script setup lang="ts">
import { LogOut } from "lucide-vue-next";

/** Шапка кабинетов: знак ША, кто вошёл, выход. */
const user = await useSession();
</script>

<template>
  <header class="bg-ink text-paper">
    <div class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
      <NuxtLink to="/" class="flex items-center gap-2 font-display text-sm">
        <span class="bg-lime text-ink grid size-8 place-items-center rounded-lg">ША</span>
        <span class="hidden sm:inline">Школа Актива</span>
      </NuxtLink>

      <div v-if="user" class="flex min-w-0 items-center gap-2 sm:gap-3">
        <AppNotificationBell />
        <div class="min-w-0 text-right">
          <p class="truncate text-sm font-semibold">{{ user.name }}</p>
          <p class="text-paper/60 text-xs">{{ user.isStaff ? "Организатор" : "Кандидат" }}</p>
        </div>
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
