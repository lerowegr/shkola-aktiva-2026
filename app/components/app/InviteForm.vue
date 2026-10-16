<script setup lang="ts">
import { Copy, UserPlus } from "lucide-vue-next";

/**
 * Пригласить организатора: имя, почта, Telegram (по желанию), роль → личная ссылка.
 * Ссылку пригласивший пересылает сам — в личку, не в общий чат.
 */
const emit = defineEmits<{ invited: [] }>();
const { data } = await useFetch("/api/staff/roles");

const firstName = ref("");
const lastName = ref("");
const email = ref("");
const telegram = ref("");
const roleId = ref("");
const invite = useAction("/api/staff/invites");
const copied = ref(false);

const link = computed(() => {
  const result = invite.result.value;
  return result?.ok && typeof result.link === "string" ? result.link : null;
});

watchEffect(() => {
  if (!roleId.value && data.value?.roles[0]) roleId.value = data.value.roles[0].id;
});

async function submit() {
  copied.value = false;
  const result = await invite.submit({
    firstName: firstName.value,
    lastName: lastName.value || undefined,
    email: email.value,
    telegram: telegram.value || undefined,
    roleId: roleId.value,
  });
  if (result.ok) emit("invited");
}

async function copy() {
  if (!link.value) return;
  await navigator.clipboard.writeText(link.value);
  copied.value = true;
}
</script>

<template>
  <form class="border-line bg-card flex flex-col gap-4 rounded-3xl border p-5" @submit.prevent="submit">
    <div class="flex items-center gap-2">
      <UserPlus class="size-5" aria-hidden="true" />
      <h2 class="font-display text-lg">Пригласить организатора</h2>
    </div>

    <div class="grid gap-4 sm:grid-cols-2">
      <UiInput v-model="firstName" label="Имя" autocomplete="off" />
      <UiInput v-model="lastName" label="Фамилия" autocomplete="off" />
    </div>
    <div class="grid gap-4 sm:grid-cols-2">
      <UiInput v-model="email" label="Почта" type="email" inputmode="email" autocomplete="off" />
      <UiInput
        v-model="telegram"
        label="Telegram — по желанию"
        placeholder="@ivan_petrov"
        autocomplete="off"
        hint="Войдёт через Telegram с этим ником — попадёт в свой аккаунт организатора."
      />
    </div>

    <UiSelect v-model="roleId" label="Роль">
      <option v-for="role in data?.roles ?? []" :key="role.id" :value="role.id">{{ role.name }}</option>
    </UiSelect>

    <UiNotice :ok="invite.result.value?.ok" :message="invite.result.value?.message" />

    <div v-if="link" class="bg-paper flex flex-col gap-2 rounded-2xl p-3">
      <p class="text-sm break-all">{{ link }}</p>
      <UiButton variant="ghost" @click="copy">
        <Copy class="size-4" aria-hidden="true" />
        {{ copied ? "Скопировано" : "Скопировать ссылку" }}
      </UiButton>
      <p class="text-ink-soft text-xs">Ссылка личная и действует неделю. Отправьте её человеку в личные сообщения.</p>
    </div>

    <UiButton type="submit" :pending="invite.pending.value" :disabled="!firstName || !email || !roleId">
      Создать приглашение
    </UiButton>
  </form>
</template>
