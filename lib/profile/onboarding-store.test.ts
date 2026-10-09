import { beforeEach, describe, expect, it } from "vitest";

import { loadCandidateApplication } from "~~/lib/applications/candidate";
import { loadUser } from "~~/lib/auth/actor";
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
  consent: true,
};

describe("знакомство на базе", () => {
  beforeEach(resetDatabase);

  it("до знакомства кабинет закрыт, после — открыт; согласие не сдвигается", async () => {
    const user = await db.user.create({ data: { firstName: "Аня", telegramId: "1" } });
    expect((await loadUser(user.id))?.needsProfile).toBe(true);
    expect(await loadOnboarding(user.id)).toMatchObject({ firstName: "Аня", consented: false });

    expect(await saveOnboarding(user.id, { ...input, consent: false })).toMatchObject({ ok: false });
    expect(await saveOnboarding(user.id, input)).toMatchObject({ ok: true });
    const first = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { consentAt: true, phone: true } });
    expect(first.phone).toBe("+7 (999) 123-45-67");
    expect((await loadUser(user.id))?.needsProfile).toBe(false);

    await saveOnboarding(user.id, { ...input, faculty: "ЮФ" });
    const second = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { consentAt: true } });
    expect(second.consentAt).toEqual(first.consentAt);
  });

  it("анкета видит курс и факультет из знакомства", async () => {
    const season = await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } });
    await db.stage.create({ data: { seasonId: season.id, kind: "APPLICATION", title: "Анкета", order: 1, mode: "OPEN" } });
    const course = await db.formQuestion.create({
      data: { seasonId: season.id, stageKind: "APPLICATION", order: 1, section: "О себе", type: "SINGLE_CHOICE", label: "Курс", options: ["1 курс", "2 курс"] },
    });
    const user = await db.user.create({ data: { firstName: "Аня" } });
    await saveOnboarding(user.id, input);

    const app = await loadCandidateApplication(user.id);
    expect(app?.application.answers[course.id]).toBe("2 курс");
    expect(app?.application.profile).toMatchObject({ lastName: "Иванова", studentId: "190123" });
  });
});
