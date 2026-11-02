import { GrammyError, type Context, type InlineKeyboard } from "grammy";
import { z } from "zod";
import { db } from "../lib/db";
import { interviewBotActor } from "../lib/interviews/bot-staff";

const panelSchema = z.object({ chatId: z.number(), messageId: z.number().int().positive() });
/** Обновляется только панель раздела. Уведомления и переписка сюда не попадают. */
export async function renderBotPanel(ctx: Context, key: string, text: string, options: { reply_markup?: InlineKeyboard } = {}) {
  if (ctx.chat?.type !== "private" || !ctx.from) return;
  const parsed = panelSchema.safeParse((await db.settings.findUnique({ where: { id: key } }))?.data);
  const old = parsed.success && parsed.data.chatId === ctx.chat.id ? parsed.data : null;
  let updated = false;
  if (old) {
    try {
      await ctx.api.editMessageText(ctx.chat.id, old.messageId, text, { reply_markup: options.reply_markup ?? { inline_keyboard: [] } });
      updated = true;
    } catch (error) {
      if (!(error instanceof GrammyError)) throw error;
      if (/message is not modified/i.test(error.description)) updated = true;
      else if (error.error_code !== 400 || !/message to edit not found|message can't be edited|message_id_invalid/i.test(error.description)) throw error;
    }
  }
  if (!updated) {
    const message = await ctx.reply(text, options);
    const data = { chatId: ctx.chat.id, messageId: message.message_id };
    await db.settings.upsert({ where: { id: key }, create: { id: key, data }, update: { data } });
  }
}

export async function interviewPanel(ctx: Context, text: string, options: { reply_markup?: InlineKeyboard } = {}) {
  if (ctx.chat?.type !== "private" || !ctx.from) return;
  const actor = await interviewBotActor(String(ctx.from.id));
  if (!actor) { await ctx.reply(text, options); return; }
  await renderBotPanel(ctx, `bot-interview-panel:${actor.id}`, text, options);
}
