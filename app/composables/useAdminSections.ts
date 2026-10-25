/** Разделы админки, на которые есть право, — для оглавления и подменю. */
export async function useAdminSections() {
  const { data: nav } = await useFetch("/api/staff/nav", { key: "staff-nav" });
  return computed(() => {
    const can = nav.value?.can;
    if (!can) return [];
    return [
      { to: "/staff/stages", label: "Этапы", about: "Даты и режимы этапов отбора", show: can.stages },
      { to: "/staff/admin/people", label: "Люди", about: "Организаторы, роли, блокировка", show: can.team },
      { to: "/staff/admin/roles", label: "Роли", about: "Наборы прав для организаторов", show: can.roles },
      { to: "/staff/admin/forms", label: "Анкета и оценка", about: "Вопросы, разделы, критерии и маркеры", show: can.forms },
      { to: "/staff/admin/quiz", label: "Тест про ША", about: "Вопросы теста и результаты", show: can.forms },
      { to: "/staff/admin/guide", label: "Сценарий собеса", about: "Блоки и вопросы собеседования", show: can.forms },
      { to: "/staff/admin/assessment-tasks", label: "Задания ЦО", about: "Задания центра оценки для комментариев экспертов", show: can.forms },
      { to: "/staff/admin/site", label: "Сайт", about: "Тексты и фото главной страницы", show: can.content },
      { to: "/staff/admin/broadcast", label: "Рассылки", about: "Сообщения кандидатам по сегментам", show: can.broadcast },
      { to: "/staff/admin/audit", label: "Журнал", about: "Кто что менял", show: can.audit },
    ].filter((item) => item.show);
  });
}
