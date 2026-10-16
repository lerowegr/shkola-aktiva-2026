import { beforeEach, describe, expect, it } from "vitest";

import { loadCandidateApplication } from "~~/lib/applications/candidate";
import { loadUser } from "~~/lib/auth/actor";
import { verifyPassword } from "~~/lib/auth/password";
import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { loadOnboarding, saveOnboarding } from "./onboarding-store";

const input = {
  lastName: "Иванова",
  firstName: "Анна",
  middleName: "",
  course: "2",
  faculty: "ФФ",
  studentId: "190123",
  phone: "89991234567",
};

const creds = { login: "anna.iv", email: "Anna@Mail.ru", password: "берёзы-у-озера", repeat: "берёзы-у-озера" };

describe("знакомство на базе", () => {
  beforeEach(resetDatabase);

  it("до знакомства кабинет закрыт, после — открыт; время знакомства не сдвигается", async () => {
    const user = await db.user.create({ data: { firstName: "Аня", telegramId: "1" } });
    expect((await loadUser(user.id))?.needsProfile).toBe(true);
    expect(await loadOnboarding(user.id)).toMatchObject({ firstName: "Аня", done: false });

    expect(await saveOnboarding(user.id, { ...input, phone: "" }, creds)).toMatchObject({ ok: false });
    // Пришёл через Telegram без пароля — без данных для входа нельзя.
    expect(await saveOnboarding(user.id, input)).toMatchObject({ ok: false });
    expect(await saveOnboarding(user.id, input, creds)).toMatchObject({ ok: true });
    const saved = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { login: true, email: true, passwordHash: true } });
    expect(saved).toMatchObject({ login: "anna.iv", email: "anna@mail.ru" });
    expect(await verifyPassword("берёзы-у-озера", saved.passwordHash!)).toBe(true);
    const first = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { onboardedAt: true, phone: true } });
    expect(first.phone).toBe("+7 (999) 123-45-67");
    expect((await loadUser(user.id))?.needsProfile).toBe(false);

    // Пароль уже есть — второй раз данные для входа не нужны.
    expect(await saveOnboarding(user.id, { ...input, faculty: "ЮФ" })).toMatchObject({ ok: true });
    const second = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { onboardedAt: true } });
    expect(second.onboardedAt).toEqual(first.onboardedAt);
  });

  it("анкета видит курс и факультет из знакомства", async () => {
    const season = await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } });
    await db.stage.create({ data: { seasonId: season.id, kind: "APPLICATION", title: "Анкета", order: 1, mode: "OPEN" } });
    const course = await db.formQuestion.create({
      data: { seasonId: season.id, stageKind: "APPLICATION", order: 1, section: "О себе", type: "SINGLE_CHOICE", label: "Курс", options: ["1 курс", "2 курс"] },
    });
    const user = await db.user.create({ data: { firstName: "Аня" } });
    await saveOnboarding(user.id, input, creds);

    const app = await loadCandidateApplication(user.id);
    expect(app?.application.answers[course.id]).toBe("2 курс");
    expect(app?.application.profile).toMatchObject({ lastName: "Иванова", studentId: "190123" });
  });

  it("занятые логин и почта — ошибки у своих полей", async () => {
    await db.user.create({ data: { login: "anna.iv", email: "other@mail.ru" } });
    await db.user.create({ data: { email: "anna@mail.ru" } });
    const user = await db.user.create({ data: { telegramId: "9" } });
    const result = await saveOnboarding(user.id, input, creds);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.problems.map((problem) => problem.field).sort()).toEqual(["email", "login"]);
  });
});
