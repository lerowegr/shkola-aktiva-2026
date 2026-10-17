# Проверка

На отдельной sha_test: `npx vitest run lib/notifications/selection-reminders.test.ts lib/interviews/interviews.test.ts`.
Далее `npm run typecheck` и линтер изменённых файлов.
В локальной авторизованной сессии кандидата проверить колокольчик и переходы:
анкета → /cabinet/application, ЦО → /cabinet. Не отправлять пробные рассылки на боевую базу.
