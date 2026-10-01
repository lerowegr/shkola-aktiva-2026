import { ref, type Ref } from "vue";

export interface ActionResult {
  ok: boolean;
  message?: string;
  [extra: string]: unknown;
}

/**
 * Вызов серверного действия из формы.
 *
 * Состояние ожидания, последний ответ и функция отправки. Ошибку сети
 * превращаем в такой же ответ, как отказ сервера: снаружи должно быть всё
 * равно, почему не получилось, — важно, что показать человеку.
 */
export function useAction<TBody = Record<string, unknown>>(url: string) {
  const pending = ref(false);
  const result: Ref<ActionResult | null> = ref(null);

  async function submit(body: TBody): Promise<ActionResult> {
    pending.value = true;

    try {
      const response = await $fetch<ActionResult>(url, {
        method: "POST",
        body: body as Record<string, unknown>,
        // Ответы 403 и 500 у нас содержательные, поэтому не бросаем.
        ignoreResponseError: true,
      });

      result.value = response;
      return response;
    } catch {
      const failure = {
        ok: false,
        message: "Нет связи с сайтом. Проверьте интернет.",
      };
      result.value = failure;
      return failure;
    } finally {
      pending.value = false;
    }
  }

  return { pending, result, submit };
}
