import type { Context } from "grammy";
import { canReceiveScan, maxScanBytes, saveConsentScan } from "../lib/participation/scan";
import { parentConsentFile } from "../lib/participation/parent-consent";
import { PARTICIPATION_PATH } from "../lib/participation/form";

export async function explainConsentScan(ctx: Context, appUrl: string) {
  if (ctx.chat?.type !== "private") return;
  if (!await canReceiveScan(String(ctx.from!.id))) {
    await ctx.reply("Прислать заявление можно после приглашения и до отправки анкеты участника.");
    return;
  }
  await ctx.replyWithDocument(await parentConsentFile(), {
    caption: `Пришли подписанное заявление фото или файлом PDF, JPG или PNG до 8 МБ. К фото или файлу добавь подпись «заявление». Затем вернись в анкету: ${appUrl}${PARTICIPATION_PATH}`,
  });
}

export async function receiveConsentScan(ctx: Context, token: string): Promise<boolean> {
  if (ctx.chat?.type !== "private" || ctx.message?.caption?.trim().toLowerCase() !== "заявление") return false;
  const file = ctx.message.document ?? ctx.message.photo?.at(-1);
  if (!file) return false;
  const telegramId = String(ctx.from!.id);

  try {
    if (!await canReceiveScan(telegramId)) {
      await ctx.reply("Прислать заявление можно после приглашения и до отправки анкеты участника.");
      return true;
    }
    if ((file.file_size ?? 0) > maxScanBytes) {
      await ctx.reply("Файл слишком большой. Пришли подписанное заявление размером до 8 МБ.");
      return true;
    }
    const info = await ctx.api.getFile(file.file_id);
    if (!info.file_path || (info.file_size ?? 0) > maxScanBytes) throw new Error("Файл недоступен");
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${info.file_path}`, {
      redirect: "error", signal: AbortSignal.timeout(25_000),
    });
    if (!response.ok) throw new Error("Не удалось получить файл");
    await ctx.reply(await saveConsentScan(telegramId, Buffer.from(await response.arrayBuffer())));
  } catch {
    await ctx.reply("Не удалось сохранить заявление. Попробуй прислать его ещё раз.");
  }
  return true;
}
