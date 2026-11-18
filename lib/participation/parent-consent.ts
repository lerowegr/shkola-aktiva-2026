import { readFile } from "node:fs/promises";

import { InputFile } from "grammy";

import { PARENT_CONSENT } from "./form";

const template = `public${PARENT_CONSENT.path}`;

export async function parentConsentFile(): Promise<InputFile> {
  // В образе сайта Nuxt кладёт публичные файлы в .output/public.
  const bytes = await readFile(template).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return readFile(`.output/${template}`);
  });
  return new InputFile(bytes, PARENT_CONSENT.filename);
}
