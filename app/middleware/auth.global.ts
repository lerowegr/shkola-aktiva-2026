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

  // Кандидат без знакомства — сначала «Давай познакомимся», потом куда шёл.
  if (to.path.startsWith("/cabinet") && to.path !== "/cabinet/welcome" && user.value.needsProfile) {
    return navigateTo(`/cabinet/welcome?next=${encodeURIComponent(to.fullPath)}`);
  }
});
