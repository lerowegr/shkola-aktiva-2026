<script setup lang="ts">
import { Plus, Trash2 } from "lucide-vue-next";

import type { RoleRow } from "~~/lib/admin/roles";
import type { PermissionGroup } from "~~/lib/permissions";

/** Роли: название и права галочками. Названий ролей в коде нет — всё здесь. */
definePageMeta({ layout: "staff" });
useHead({ title: "Роли" });

const { data, refresh } = await useFetch<{ groups: PermissionGroup[]; roles: (RoleRow & { grantable: boolean })[] }>("/api/admin/roles");

const editing = ref<string | "new" | null>(null);
const form = reactive({ name: "", description: "", color: "#1c63ff", permissions: [] as string[] });

function edit(role: (RoleRow & { grantable: boolean }) | null) {
  editing.value = role?.id ?? "new";
  form.name = role?.name ?? "";
  form.description = role?.description ?? "";
  form.color = role?.color ?? "#1c63ff";
  form.permissions = [...(role?.permissions ?? [])];
  save.result.value = null;
}

const save = useAction("/api/admin/roles/save");
async function submit() {
  const result = await save.submit({
    id: editing.value === "new" ? undefined : editing.value,
    name: form.name,
    description: form.description || null,
    color: form.color,
    permissions: form.permissions,
  });
  if (result.ok) {
    editing.value = null;
    await refresh();
  }
}

const remove = useAction("/api/admin/roles/delete");
async function removeRole(id: string) {
  const result = await remove.submit({ id });
  if (result.ok) await refresh();
}

const labelOf = computed(() => new Map((data.value?.groups ?? []).flatMap((group) => group.permissions.map((p) => [p.key, p.label]))));
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <StaffAdminNav />

    <div class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex flex-col gap-1">
        <h1 class="font-display text-3xl">Роли</h1>
        <p class="text-ink-soft max-w-2xl text-sm">
          Роль — набор прав. Настроить можно только роль, все права которой есть у вас самих.
        </p>
      </div>
      <UiButton class="shrink-0 whitespace-nowrap sm:w-auto" @click="edit(null)"><Plus class="size-4" aria-hidden="true" /> Новая роль</UiButton>
    </div>

    <UiNotice v-if="remove.result.value && !remove.result.value.ok" :message="remove.result.value.message" />

    <form v-if="editing" class="bg-card border-line flex flex-col gap-5 rounded-3xl border p-5" @submit.prevent="submit">
      <h2 class="font-display text-lg">{{ editing === "new" ? "Новая роль" : "Роль" }}</h2>
      <div class="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
        <UiInput v-model="form.name" label="Название" />
        <UiInput v-model="form.description" label="Описание — необязательно" />
        <label class="flex flex-col gap-1.5 text-sm font-medium">
          Цвет
          <input v-model="form.color" type="color" class="border-line bg-paper h-12 w-full rounded-2xl border px-2" >
        </label>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <fieldset v-for="group in data?.groups ?? []" :key="group.key" class="border-line rounded-2xl border p-4">
          <legend class="px-1 text-sm font-semibold">{{ group.label }}</legend>
          <div class="flex flex-col">
            <UiCheckbox
              v-for="permission in group.permissions"
              :key="permission.key"
              v-model="form.permissions"
              :value="permission.key"
              class="py-1.5"
            >
              <span>
                <span class="block text-sm font-medium">{{ permission.label }}</span>
                <span class="text-ink-soft block text-xs">{{ permission.description }}</span>
              </span>
            </UiCheckbox>
          </div>
        </fieldset>
      </div>

      <UiNotice :ok="save.result.value?.ok" :message="save.result.value?.ok ? null : save.result.value?.message" />
      <div class="flex gap-2 sm:w-80">
        <UiButton variant="ghost" @click="editing = null">Отмена</UiButton>
        <UiButton type="submit" :pending="save.pending.value">Сохранить</UiButton>
      </div>
    </form>

    <div class="grid gap-3 md:grid-cols-2">
      <article v-for="role in data?.roles ?? []" :key="role.id" class="bg-card border-line flex flex-col gap-3 rounded-3xl border p-5">
        <div class="flex items-start gap-3">
          <span class="mt-1 size-3 shrink-0 rounded-full" :style="{ background: role.color ?? '#5c5c5c' }" />
          <div class="min-w-0 flex-1">
            <h2 class="font-semibold">{{ role.name }}</h2>
            <p v-if="role.description" class="text-ink-soft text-sm">{{ role.description }}</p>
            <p class="text-ink-soft text-xs">Людей: {{ role.people }}<template v-if="role.isSystem"> · системная</template></p>
          </div>
        </div>
        <div class="flex flex-wrap gap-1">
          <span v-for="key in role.permissions" :key="key" class="bg-paper rounded-md px-1.5 py-0.5 text-xs">{{ labelOf.get(key) ?? key }}</span>
          <span v-if="!role.permissions.length" class="text-ink-soft text-xs">Прав нет</span>
        </div>
        <div class="mt-auto flex gap-2">
          <button
            v-if="role.grantable"
            type="button"
            class="border-line hover:border-ink-soft rounded-xl border px-3 py-2 text-sm"
            @click="edit(role)"
          >
            Изменить
          </button>
          <span v-else class="text-ink-soft self-center text-xs">Сильнее ваших прав</span>
          <button
            v-if="role.grantable && !role.isSystem && role.people === 0"
            type="button"
            class="text-ink-soft hover:text-danger ml-auto grid size-9 place-items-center rounded-xl"
            aria-label="Удалить роль"
            @click="removeRole(role.id)"
          >
            <Trash2 class="size-4" aria-hidden="true" />
          </button>
        </div>
      </article>
    </div>
  </main>
</template>
