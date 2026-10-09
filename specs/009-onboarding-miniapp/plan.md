# Plan
- `User`: middleName, course, faculty, studentId, phone, onboardedAt. `CurrentUser.needsProfile`.
- Чистое ядро `lib/profile/onboarding.ts`: списки, проверка, подсказки ответов анкеты.
- `GET/POST /api/cabinet/onboarding`; страница `/cabinet/welcome`; ворота в `auth.global.ts`
  и на сервере (`requireProfile` в отправке анкеты и теста).
- Mini App: `runtimeConfig.public.miniApp` = "test" | "cabinet" (`NUXT_PUBLIC_MINI_APP`);
  `/tg` ведёт на тест, внутри Telegram у теста нет ссылок в кабинет.
- Анкета: подсказки из профиля для пустых вопросов, сохраняются при открытии черновика.
