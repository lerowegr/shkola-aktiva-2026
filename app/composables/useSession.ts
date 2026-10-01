import type { CurrentUser } from "~~/lib/auth/actor";

/**
 * Кто вошёл — на стороне браузера.
 *
 * Ответ лежит в общем состоянии Nuxt: проверка маршрутов, шапка и
 * страницы спрашивают его один раз за загрузку, а не каждая по-своему.
 * Даты приезжают из JSON строками, но в CurrentUser их нет — тип честный.
 */
export async function useSession() {
  const user = useState<CurrentUser | null>("session", () => null);
  const loaded = useState<boolean>("session-loaded", () => false);

  if (!loaded.value) {
    const { data } = await useFetch("/api/session");
    user.value = (data.value?.user as CurrentUser | null) ?? null;
    loaded.value = true;
  }

  return user;
}

/** Перечитать себя после входа или выхода. */
export async function refreshSession(): Promise<CurrentUser | null> {
  const user = useState<CurrentUser | null>("session");
  const response = await $fetch("/api/session");
  user.value = (response.user as CurrentUser | null) ?? null;
  return user.value;
}

/** Выйти и уйти на главную. */
export async function signOut(): Promise<void> {
  await $fetch("/api/auth/logout", { method: "POST" });
  await refreshSession();
  await navigateTo("/");
}

/** Куда вести после входа: в кабинет организатора или кандидата. */
export function homeFor(user: CurrentUser | null): string {
  return user?.isStaff ? "/staff" : "/cabinet";
}
