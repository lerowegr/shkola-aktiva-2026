import { parseFacultyFilter, type FacultyFilter } from "~~/lib/profile/faculty";

/**
 * Выбранный факультет — в адресе страницы (?faculty=МЭО): фильтр
 * переживает обновление, а ссылкой с ним можно поделиться.
 */
export function useFacultyFilter() {
  const route = useRoute();
  const router = useRouter();
  return computed<FacultyFilter>({
    get: () => parseFacultyFilter(route.query.faculty),
    set: (value) => {
      void router.replace({ query: { ...route.query, faculty: value || undefined } });
    },
  });
}
