# Plan: «Тест про ША»

- Данные: `QuizAttempt` (`quiz_attempts`): seasonId, userId?, telegramId BigInt?, score, total,
  durationMs, answers Json (снимок), profile Json? (из бота), source SITE|BOT, completedAt;
  уникальны (seasonId, userId) и (seasonId, telegramId). Вопросы — существующая `QuizQuestion`.
- Чистое ядро `lib/games/sha-test.ts`: подсчёт по снимку, разбор ответов, статистика; база —
  `lib/games/sha-test-store.ts`: загрузка для кандидата (поиск по userId или его telegramId с
  привязкой), сохранение под уникальным ключом, итоги и CSV.
- API: `GET /api/cabinet/test`, `POST /api/cabinet/test/submit` (defineAction + requireSignedIn);
  `GET /api/admin/quiz/results` (forms.manage), `GET /api/admin/quiz/results.csv`
  (applications.view_all).
- UI: `app/components/game/ShaTest.vue`, ветка в `cabinet/games/[game].vue`; «Админка → Тест про ША».
- `GAMES.QUIZ` → «Тест про ША»; `RATED_GAMES` без QUIZ — рейтинг, доска, сохранение партий.
- Импорт: `scripts/import-bot-test.ts <json>` (JSON выгружается из SQLite бота).
