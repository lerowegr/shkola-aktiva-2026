import { readFile } from "node:fs/promises";

import { InputFile } from "grammy";

const template = "public/participation/parent-consent.docx";

export const PARENT_CONSENT_CAPTION = "Заявление для несовершеннолетних. Его нужно подписать у родителя или законного представителя.";

export async function parentConsentFile(): Promise<InputFile> {
  // В образе сайта Nuxt кладёт публичные файлы в .output/public.
  const bytes = await readFile(template).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return readFile(`.output/${template}`);
  });
  return new InputFile(bytes, "Заявление для несовершеннолетних.docx");
}
