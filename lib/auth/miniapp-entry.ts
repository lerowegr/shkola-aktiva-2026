/** Переходы Mini App: тест доступен до знакомства, кабинет — после него. */
interface EntryUser {
  isStaff: boolean;
  needsProfile: boolean;
}

export function miniAppSitePath(user: EntryUser | null): string {
  if (!user || user.needsProfile) return "/";
  return user.isStaff ? "/staff" : "/cabinet";
}

/** Прямые ссылки из уведомлений важнее выбора стартового экрана. */
export function miniAppTarget(
  screen: unknown,
  to: unknown,
  user: EntryUser | null,
): string | null {
  if (
    typeof to === "string" &&
    to.startsWith("/") &&
    !to.startsWith("//") &&
    ![...to].some((char) => char === "\\" || char.charCodeAt(0) <= 32) &&
    !/^\/tg(?:[/?#]|$)/.test(to)
  ) {
    return to;
  }
  if (screen === "test") return "/test";
  if (screen === "site") return miniAppSitePath(user);
  return null;
}

export function testNextAction(user: EntryUser | null): {
  href: string;
  label: string;
} {
  if (!user) return { href: "/", label: "Перейти на сайт ША" };
  if (user.isStaff) return { href: "/staff", label: "В кабинет организатора" };
  if (user.needsProfile)
    return { href: "/cabinet/welcome", label: "Зарегистрироваться на ША" };
  return { href: "/cabinet", label: "В личный кабинет" };
}
