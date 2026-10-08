import { describe, expect, it } from "vitest";

import { csvCell, grade, readAnswers, testStats } from "./sha-test";

const questions = [
  { id: "q1", text: "Сколько дней идёт ША?", options: ["1", "2", "3"], correct: 2 },
  { id: "q2", text: "Из искры — …", options: ["свет", "пламя"], correct: 1 },
];

describe("grade", () => {
  it("считает верные по эталону сервера", () => {
    const result = grade(questions, [
      { questionId: "q1", chosen: 2, ms: 1200 },
      { questionId: "q2", chosen: 0, ms: 800 },
    ]);
    expect(result).toMatchObject({ ok: true, score: 1, total: 2, durationMs: 2000 });
    if (result.ok) expect(result.answers[1]).toMatchObject({ chosen: "свет", correct: false });
  });

  it("без ответа на вопрос — отказ", () => {
    expect(grade(questions, [{ questionId: "q1", chosen: 2, ms: 1 }])).toMatchObject({ ok: false });
  });

  it("лишний или несуществующий вариант — отказ", () => {
    expect(
      grade(questions, [
        { questionId: "q1", chosen: 5, ms: 1 },
        { questionId: "q2", chosen: 1, ms: 1 },
      ]),
    ).toMatchObject({ ok: false });
    expect(
      grade(questions, [
        { questionId: "q1", chosen: 2, ms: 1 },
        { questionId: "q2", chosen: 1, ms: 1 },
        { questionId: "q3", chosen: 0, ms: 1 },
      ]),
    ).toMatchObject({ ok: false });
  });

  it("время режется сверху и снизу", () => {
    const result = grade(questions, [
      { questionId: "q1", chosen: 2, ms: -5 },
      { questionId: "q2", chosen: 1, ms: 99_999_999 },
    ]);
    expect(result.ok && result.answers.map((answer) => answer.ms)).toEqual([0, 600_000]);
  });
});

describe("итоги", () => {
  it("распределение, доля верных по вопросам, вопросы бота без id — по тексту", () => {
    const site = { score: 2, total: 2, source: "SITE", answers: [
      { questionId: "q1", question: "Сколько дней идёт ША?", chosen: "3", correct: true, ms: 1000 },
      { questionId: "q2", question: "Из искры — …", chosen: "пламя", correct: true, ms: 3000 },
    ] };
    const bot = { score: 0, total: 2, source: "BOT", answers: [
      { questionId: null, question: "Из искры — …", chosen: "", correct: false, ms: 1000 },
      { questionId: null, question: "Сколько дней идёт ША?", chosen: "", correct: false, ms: 3000 },
    ] };
    const stats = testStats([site, bot], questions);
    expect(stats.participants).toBe(2);
    expect(stats.average).toBe(1);
    expect(stats.distribution.find((row) => row.score === 2)?.count).toBe(1);
    expect(stats.questions.map((row) => [row.question, row.correctShare, row.averageMs])).toEqual([
      ["Сколько дней идёт ША?", 0.5, 2000],
      ["Из искры — …", 0.5, 2000],
    ]);
    expect(stats.bySource).toEqual({ site: 1, bot: 1 });
  });

  it("снимок из мусора — пусто", () => {
    expect(readAnswers("x")).toEqual([]);
    expect(readAnswers([{ question: 1 }])).toEqual([]);
  });
});

describe("csvCell", () => {
  it("кавычки, разделитель и формулы", () => {
    expect(csvCell("Иванов; Иван")).toBe('"Иванов; Иван"');
    expect(csvCell('Он сказал "да"')).toBe('"Он сказал ""да"""');
    expect(csvCell("=HYPERLINK()")).toBe("'=HYPERLINK()");
    expect(csvCell("+79991234567")).toBe("+79991234567");
    expect(csvCell("+cmd")).toBe("'+cmd");
    expect(csvCell(null)).toBe("");
  });
});
