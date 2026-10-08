import { shuffled, type Rng } from "./rng";

/**
 * «Викторина» задания дня: 10 вопросов на время из встроенного пула ниже —
 * про то, как устроен отбор на платформе. «Тест про ША» в мини-играх —
 * отдельный (app/games/sha-test-questions.ts, lib/games/sha-test.ts).
 */
export interface QuizItem {
  id: string;
  text: string;
  options: string[];
  /** Индекс верного варианта. */
  correct: number;
}

export interface QuizQuestion {
  text: string;
  answer: string;
  wrong: string[];
}

export const QUIZ_SECONDS_PER_QUESTION = 15;
export const QUIZ_ROUND_SIZE = 10;

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  { text: "Что такое Школа Актива?", answer: "Проект для студенческих активистов", wrong: ["Факультет", "Спортивная секция", "Столовая"] },
  { text: "Сколько этапов в отборе ША 2026?", answer: "Пять", wrong: ["Два", "Три", "Восемь"] },
  { text: "Что идёт после анкеты?", answer: "Домашнее задание", wrong: ["Сразу итоги", "Выпускной", "Каникулы"] },
  { text: "Кто проверяет анкеты?", answer: "Мастера отбора", wrong: ["Деканат", "Случайные студенты", "Нейросеть"] },
  { text: "Где живут уведомления отбора?", answer: "В колокольчике на сайте", wrong: ["На доске объявлений", "В газете", "По радио"] },
  { text: "Как войти в кабинет без пароля?", answer: "Через Telegram", wrong: ["По студбилету в деканате", "По звонку другу", "Никак"] },
  { text: "Что будет, если пропустить дедлайн этапа?", answer: "Этап закроется", wrong: ["Ничего страшного", "Дедлайн продлят", "Начнётся заново"] },
  { text: "Влияют ли мини-игры на отбор?", answer: "Нет, это для ожидания", wrong: ["Да, это главный критерий", "Да, наполовину", "Только «Пятнашки»"] },
  { text: "Что такое слот собеседования?", answer: "Время и место встречи", wrong: ["Игровой автомат", "Разъём для карты", "Пара в расписании"] },
  { text: "Когда кандидат видит решение по этапу?", answer: "После публикации этапа целиком", wrong: ["Сразу после проверки", "За день до", "Никогда"] },
  { text: "Видит ли кандидат свои баллы за центр оценки?", answer: "Нет", wrong: ["Да, сразу", "Только средний балл", "Только лучшие"] },
  { text: "Можно ли править отправленную анкету?", answer: "Нет, только черновик", wrong: ["Да, всегда", "Да, за деньги", "Только ночью"] },
];

export interface QuizRoundItem {
  id: string;
  text: string;
  answer: string;
  options: string[];
  correct: number;
}

/** Раунд: 10 разных вопросов, варианты перемешаны. */
export function buildRound(rng: Rng, pool: QuizQuestion[] = QUIZ_QUESTIONS, size = QUIZ_ROUND_SIZE): QuizRoundItem[] {
  return shuffled(pool, rng)
    .slice(0, size)
    .map((question, index) => {
      const options = shuffled([question.answer, ...question.wrong.slice(0, 3)], rng);
      return {
        id: `q${index}`,
        text: question.text,
        answer: question.answer,
        options,
        correct: options.indexOf(question.answer),
      };
    });
}

/** Очки за верный ответ: 100 + секунда в запасе × 10. */
export function questionScore(secondsLeft: number): number {
  return 100 + Math.max(0, Math.round(secondsLeft)) * 10;
}
