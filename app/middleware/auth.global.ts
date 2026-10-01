/**
 * Ворота на стороне браузера.
 *
 * Настоящая проверка — на сервере, в каждом обработчике. Здесь мы просто
 * не показываем страницу тому, кому её не видно, чтобы он не смотрел на
 * пустые блоки и сообщения об ошибке.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  const needsUser = to.path.startsWith("/cabinet") || to.path.startsWith("/staff");
  if (!needsUser) return;

  const user = await useSession();

  if (!user.value) {
    return navigateTo(`/login?from=${encodeURIComponent(to.fullPath)}`);
  }

  if (to.path.startsWith("/staff") && !user.value.isStaff) {
    return navigateTo("/cabinet");
  }
});
