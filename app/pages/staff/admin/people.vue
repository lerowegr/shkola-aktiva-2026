<script setup lang="ts">
import { refDebounced } from "@vueuse/core";
import { Ban, Copy, KeyRound, Search, ShieldCheck, Trash2, X } from "lucide-vue-next";

import type { PersonRow } from "~~/lib/admin/people";

/**
 * Люди: роли, блокировка, ссылки-приглашения, удаление организатора
 * (только тех.админ — «люди» и «роли» вместе). Справа — пригласить нового.
 */
definePageMeta({ layout: "staff" });
useHead({ title: "Люди" });

const search = ref("");
const q = refDebounced(search, 250);
const scope = ref<"staff" | "all">("staff");

const { data, refresh } = await useFetch<{ people: PersonRow[] }>("/api/admin/people", { query: { q, scope } });
const { data: roles } = await useFetch<{ roles: { id: string; name: string; grantable: boolean }[] }>("/api/admin/roles");
const user = await useSession();
const { data: nav } = await useFetch("/api/staff/nav", { key: "staff-nav" });
const canDelete = computed(() => Boolean(nav.value?.can.team && nav.value?.can.roles));

// --- Удаление организатора ----------------------------------------------------
interface DeleteCheck {
  name: string;
  scored: number;
  assigned: number;
  notes: number;
  interviews: number;
  groups: number;
}
const removing = ref<{ person: PersonRow; check: DeleteCheck | null; successor: string; pending: boolean } | null>(null);
async function askDelete(person: PersonRow) {
  removing.value = { person, check: null, successor: "", pending: false };
  removing.value.check = await $fetch<DeleteCheck>("/api/admin/people/delete-check", { query: { userId: person.id } }).catch(() => null);
}
const hasWork = (check: DeleteCheck | null) => Boolean(check && check.scored + check.notes + check.interviews + check.groups > 0);
const successors = computed(() =>
  (data.value?.people ?? []).filter((item) => item.roles.length > 0 && !item.blocked && item.id !== removing.value?.person.id),
);
async function confirmDelete() {
  const current = removing.value;
  if (!current) return;
  current.pending = true;
  const result = await call(
    "/api/admin/people/delete",
    { userId: current.person.id, successorId: current.successor || null },
    current.person.id,
  );
  current.pending = false;
  if (result.ok) {
    removing.value = null;
    message.value = { id: "deleted", ok: true, text: result.message ?? "Удалён." };
  }
}

const open = ref<string | null>(null);
const message = ref<{ id: string; ok: boolean; text: string } | null>(null);
const links = ref<Record<string, string>>({});

async function call(path: string, body: Record<string, unknown>, personId: string) {
  const result = await $fetch<{ ok: boolean; message?: string; link?: string }>(path, {
    method: "POST",
    body,
    ignoreResponseError: true,
  });
  message.value = result.message || !result.ok ? { id: personId, ok: result.ok, text: result.message ?? "Не получилось." } : null;
  if (result.link) links.value = { ...links.value, [personId]: result.link };
  await refresh();
  return result;
}

// Селект — не поле со значением, а кнопка «выдать»: после выбора сразу
// возвращаем его к подсказке, иначе в нём останется соседняя роль.
function grantRole(person: PersonRow, event: Event) {
  const select = event.target as HTMLSelectElement;
  const roleId = select.value;
  select.value = "";
  if (roleId) return call("/api/admin/people/grant", { userId: person.id, roleId }, person.id);
}
const revokeRole = (person: PersonRow, roleId: string) => call("/api/admin/people/revoke", { userId: person.id, roleId }, person.id);
const block = (person: PersonRow) => call("/api/admin/people/block", { userId: person.id, blocked: !person.blocked }, person.id);
const invite = (person: PersonRow) => call("/api/admin/people/invite", { userId: person.id }, person.id);
// Ник Telegram организатора: войдёт через Telegram или Mini App — сразу в свой аккаунт.
const tgDraft = ref<Record<string, string>>({});
const saveTelegram = (person: PersonRow) =>
  call("/api/admin/people/telegram", { id: person.id, telegram: tgDraft.value[person.id] ?? person.telegramUsername ?? "" }, person.id);
const resetNick = (person: PersonRow) => call("/api/admin/people/reset-nick", { id: person.id }, person.id);

async function copy(text: string) {
  await navigator.clipboard.writeText(text);
}

const APP = { none: "без анкеты", draft: "анкета: черновик", submitted: "анкета отправлена" } as const;

function initialsOf(name: string) {
  const words = name.replace(/^@/, "").split(/[\s@.]+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase() || "?";
}
</script>

<template>
  <main class="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8">
    <StaffAdminNav />

    <div class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section class="flex min-w-0 flex-col gap-4">
        <div class="flex flex-col gap-1">
          <h1 class="font-display text-3xl">Люди</h1>
          <p class="text-ink-soft text-sm">
            Организаторы и кандидаты. Роль можно выдать или снять, только если все её права есть у вас.
          </p>
        </div>
        <UiNotice v-if="message?.id === 'deleted'" :ok="message.ok" :message="message.text" />

        <div class="flex flex-col gap-2 sm:flex-row">
          <label class="relative flex-1">
            <span class="sr-only">Поиск</span>
            <Search class="text-ink-soft absolute top-1/2 left-3.5 size-4 -translate-y-1/2" aria-hidden="true" />
            <input
              v-model="search"
              type="search"
              placeholder="Имя, почта или Telegram"
              class="border-line bg-card focus:border-accent min-h-11 w-full rounded-2xl border pr-3 pl-10 text-sm outline-none"
            >
          </label>
          <div role="tablist" class="bg-card border-line grid grid-cols-2 gap-1 rounded-2xl border p-1">
            <button
              v-for="item in [
                { key: 'staff', label: 'Организаторы' },
                { key: 'all', label: 'Все' },
              ] as const"
              :key="item.key"
              type="button"
              role="tab"
              :aria-selected="scope === item.key"
              class="min-h-9 rounded-xl px-3 text-sm font-medium"
              :class="scope === item.key ? 'bg-paper' : 'text-ink-soft'"
              @click="scope = item.key"
            >
              {{ item.label }}
            </button>
          </div>
        </div>

        <ul class="bg-card border-line overflow-hidden rounded-3xl border">
          <li v-for="person in data?.people ?? []" :key="person.id" class="border-line border-t first:border-t-0">
            <button
              type="button"
              class="hover:bg-paper flex w-full items-center gap-3 px-4 py-3 text-left"
              :aria-expanded="open === person.id"
              @click="open = open === person.id ? null : person.id"
            >
              <StaffAvatar :seed="person.id" :text="initialsOf(person.name)" />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-sm font-semibold" :class="person.blocked && 'line-through opacity-60'">{{ person.name }}</span>
                <span class="text-ink-soft block truncate text-xs">
                  {{ person.email ?? "без почты" }}<template v-if="person.telegramUsername"> · @{{ person.telegramUsername }}</template>
                  <template v-if="person.nickname"> · ник {{ person.nickname }}</template>
                  <template v-if="!person.roles.length && !person.isOwner"> · {{ APP[person.application] }}</template>
                </span>
              </span>
              <span class="hidden flex-wrap justify-end gap-1 sm:flex">
                <span v-if="person.isOwner" class="bg-ink text-paper rounded-md px-1.5 py-0.5 text-xs">владелец</span>
                <span v-for="role in person.roles" :key="role.id" class="bg-paper rounded-md px-1.5 py-0.5 text-xs">{{ role.name }}</span>
                <span v-if="person.blocked" class="bg-brand-red-soft text-danger rounded-md px-1.5 py-0.5 text-xs">заблокирован</span>
              </span>
            </button>

            <div v-if="open === person.id" class="bg-paper/60 flex flex-col gap-3 px-4 pt-1 pb-4">
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-ink-soft text-xs">Роли:</span>
                <span v-for="role in person.roles" :key="role.id" class="bg-card border-line flex items-center gap-1 rounded-lg border py-0.5 pr-1 pl-2 text-xs">
                  {{ role.name }}
                  <button type="button" class="text-ink-soft hover:text-danger" :aria-label="`Снять роль ${role.name}`" @click="revokeRole(person, role.id)">
                    <X class="size-3.5" aria-hidden="true" />
                  </button>
                </span>
                <UiSelect
                  size="xs"
                  aria-label="Выдать роль"
                  :model-value="''"
                  @change="grantRole(person, $event)"
                >
                  <option value="" disabled>+ выдать роль</option>
                  <option
                    v-for="role in (roles?.roles ?? []).filter((item) => item.grantable && !person.roles.some((r) => r.id === item.id))"
                    :key="role.id"
                    :value="role.id"
                  >
                    {{ role.name }}
                  </option>
                </UiSelect>
              </div>

              <div class="flex flex-wrap gap-2">
                <span class="text-ink-soft flex items-center gap-1 text-xs">
                  <ShieldCheck class="size-3.5" aria-hidden="true" />
                  {{ person.hasPassword ? "пароль задан" : "пароля нет" }} · {{ person.hasTelegram ? "Telegram привязан" : "без Telegram" }}
                </span>
              </div>

              <form
                v-if="person.roles.length > 0 && !person.hasTelegram"
                class="flex flex-col gap-1.5"
                @submit.prevent="saveTelegram(person)"
              >
                <label :for="`tg-${person.id}`" class="text-ink-soft text-xs">
                  Telegram для входа — войдёт через Telegram или Mini App сразу в свой аккаунт
                </label>
                <div class="flex gap-2">
                  <input
                    :id="`tg-${person.id}`"
                    :value="tgDraft[person.id] ?? (person.telegramUsername ? `@${person.telegramUsername}` : '')"
                    placeholder="@ivan_petrov"
                    autocomplete="off"
                    autocapitalize="off"
                    class="border-line bg-card focus:border-accent min-h-10 min-w-0 flex-1 rounded-xl border px-3 text-sm outline-none"
                    @input="tgDraft[person.id] = ($event.target as HTMLInputElement).value"
                  >
                  <button type="submit" class="bg-ink text-paper rounded-xl px-4 text-sm font-semibold">Сохранить</button>
                </div>
              </form>

              <div class="flex flex-wrap gap-2">
                <button
                  v-if="person.email && !person.blocked"
                  type="button"
                  class="border-line bg-card hover:border-ink-soft flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm"
                  @click="invite(person)"
                >
                  <KeyRound class="size-4" aria-hidden="true" /> Ссылка для пароля
                </button>
                <button
                  v-if="!person.isOwner && person.id !== user?.id"
                  type="button"
                  class="flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm"
                  :class="person.blocked ? 'border-ok text-ok' : 'border-danger/40 text-danger hover:border-danger'"
                  @click="block(person)"
                >
                  <Ban class="size-4" aria-hidden="true" /> {{ person.blocked ? "Вернуть доступ" : "Заблокировать" }}
                </button>
                <button
                  v-if="canDelete && person.roles.length > 0 && !person.isOwner && person.id !== user?.id"
                  type="button"
                  class="border-danger/40 text-danger hover:border-danger flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm"
                  @click="askDelete(person)"
                >
                  <Trash2 class="size-4" aria-hidden="true" /> Удалить
                </button>
                <button
                  v-if="person.nickname"
                  type="button"
                  class="border-line bg-card hover:border-ink-soft flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm"
                  @click="resetNick(person)"
                >
                  Сбросить ник
                </button>
              </div>

              <div v-if="links[person.id]" class="bg-card flex items-center gap-2 rounded-xl p-2">
                <code class="min-w-0 flex-1 truncate text-xs">{{ links[person.id] }}</code>
                <button type="button" class="text-accent flex items-center gap-1 text-xs font-semibold" @click="copy(links[person.id]!)">
                  <Copy class="size-3.5" aria-hidden="true" /> Скопировать
                </button>
              </div>
              <div v-if="removing?.person.id === person.id" class="border-danger/40 bg-card flex flex-col gap-3 rounded-2xl border p-3">
                <p class="text-sm font-semibold">Удалить {{ person.name }} совсем?</p>
                <p class="text-ink-soft text-sm">
                  Аккаунт, роли и входы пропадут, вернуть их нельзя. Если человек просто временно не участвует —
                  лучше «Заблокировать».
                </p>
                <p v-if="!removing.check" class="text-ink-soft text-sm">Смотрим, есть ли у него работа…</p>
                <template v-else>
                  <ul class="text-sm">
                    <li>Оценок с баллами: <b>{{ removing.check.scored }}</b>, назначено без оценки: <b>{{ removing.check.assigned }}</b></li>
                    <li>Заметок собеседований: <b>{{ removing.check.notes }}</b>, собеседований впереди: <b>{{ removing.check.interviews }}</b></li>
                    <li>Групп ЦО: <b>{{ removing.check.groups }}</b></li>
                  </ul>
                  <UiSelect v-model="removing.successor" :label="hasWork(removing.check) ? 'Кому передать работу — баллы сохранятся' : 'Кому передать назначения — необязательно'" size="md">
                    <option value="">{{ hasWork(removing.check) ? "Выберите организатора" : "Никому — снять назначения" }}</option>
                    <option v-for="item in successors" :key="item.id" :value="item.id">{{ item.name }}</option>
                  </UiSelect>
                </template>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    class="bg-danger rounded-xl px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    :disabled="!removing.check || removing.pending || (hasWork(removing.check) && !removing.successor)"
                    @click="confirmDelete"
                  >
                    {{ removing.pending ? "Удаляем…" : "Удалить" }}
                  </button>
                  <button type="button" class="border-line rounded-xl border px-3 py-2 text-sm" @click="removing = null">Отмена</button>
                </div>
              </div>
              <UiNotice v-if="message?.id === person.id" :ok="message.ok" :message="message.text" />
            </div>
          </li>
        </ul>
        <p v-if="data && data.people.length === 0" class="text-ink-soft text-center text-sm">Никого не нашли.</p>
      </section>

      <aside>
        <AppInviteForm @invited="refresh" />
      </aside>
    </div>
  </main>
</template>
