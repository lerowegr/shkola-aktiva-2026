/**
 * Подсказка вопроса с переписками.
 *
 * Обычный текст — абзацами, как написан. Блок между строками «[чат]» и
 * «[/чат]» — переписка: строка «Имя: текст» начинает новое сообщение от
 * этого человека, следующие строки дописываются в него. Так организаторы
 * в админке оформляют задания вроде «Продолжи переписку» без вёрстки.
 */
export type HelpBlock =
  | { kind: "text"; text: string }
  | { kind: "chat"; messages: { author: string; text: string }[] };

// Имя — до трёх слов без запятых: «Катя», «Мама», «Анна Петровна». Фраза
// вроде «Тем более сейчас и так дел куча: …» именем не считается.
const AUTHOR = /^([A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё.-]{0,19}(?: [A-Za-zА-Яа-яЁё.-]{1,20}){0,2}):\s*(.*)$/;

export function parseHelp(raw: string): HelpBlock[] {
  const blocks: HelpBlock[] = [];
  const parts = raw.split(/^\[чат\]\s*$|^\[\/чат\]\s*$/m);
  // split по разделителю: чётные части — текст, нечётные — переписки.
  parts.forEach((part, index) => {
    if (index % 2 === 0) {
      const text = part.replace(/^\n+|\n+$/g, "");
      if (text.trim()) blocks.push({ kind: "text", text });
      return;
    }
    const messages: { author: string; text: string }[] = [];
    for (const line of part.split("\n")) {
      const match = AUTHOR.exec(line.trim());
      if (match) messages.push({ author: match[1]!.trim(), text: match[2] ?? "" });
      else if (messages.length) messages.at(-1)!.text += (messages.at(-1)!.text ? "\n" : "") + line.trim();
      else if (line.trim()) messages.push({ author: "", text: line.trim() });
    }
    for (const message of messages) message.text = message.text.trim();
    if (messages.length) blocks.push({ kind: "chat", messages });
  });
  return blocks;
}

/** Текст с ссылками — кусками: ссылки открываются нажатием (сдачи ДЗ). */
export function linkParts(text: string): { text: string; href: string | null }[] {
  const parts: { text: string; href: string | null }[] = [];
  const re = /https?:\/\/[^\s<>"]+[^\s<>".,;:!?)»]/g;
  let last = 0;
  for (const match of text.matchAll(re)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), href: null });
    parts.push({ text: match[0], href: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), href: null });
  return parts;
}
