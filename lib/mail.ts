import nodemailer, { type Transporter } from "nodemailer";

/**
 * Отправка писем.
 *
 * Адрес почтового сервера — одна строка SMTP_URL
 * (smtps://логин:пароль@smtp.example.com:465). Пусто — письмо печатается в
 * консоль сервера: в разработке так удобнее, чем заводить почтовый ящик.
 *
 * Никогда не передавайте пользовательский ввод в опции raw или в пути
 * вложений — у nodemailer это известные дыры.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
}

let transporter: Transporter | null = null;

function transport(): Transporter | null {
  const url = process.env.SMTP_URL?.trim();
  if (!url) return null;
  transporter ??= nodemailer.createTransport(url);
  return transporter;
}

export async function sendMail(mail: Mail): Promise<void> {
  const smtp = transport();

  if (!smtp) {
    console.info(`\n[письмо] кому: ${mail.to}\n[письмо] тема: ${mail.subject}\n${mail.text}\n`);
    return;
  }

  await smtp.sendMail({
    from: process.env.MAIL_FROM ?? "Школа Актива <no-reply@example.com>",
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
  });
}
