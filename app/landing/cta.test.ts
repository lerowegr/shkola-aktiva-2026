import { describe, expect, it } from "vitest";

import { landingCta, type LandingStage } from "./cta";

const format = (value: string) => value.slice(5, 10); // «MM-DD» — формат здесь не важен
const stage = (state: LandingStage["state"], extra: Partial<LandingStage> = {}): LandingStage[] => [
  { id: "a", kind: "APPLICATION", title: "Анкета", opensAt: "2026-11-01T09:00:00Z", closesAt: "2026-11-15T20:59:00Z", state, ...extra },
];

describe("главная кнопка лендинга", () => {
  it("анкета открыта — «Подать заявку» и дедлайн", () => {
    expect(landingCta(stage("open"), null, format)).toEqual({
      label: "Подать заявку",
      to: "/login",
      status: "Анкета открыта до 11-15",
      live: true,
    });
  });

  it("ещё не открыта — «Зарегистрироваться» и дата открытия", () => {
    const cta = landingCta(stage("upcoming"), null, format);
    expect([cta.label, cta.status, cta.live]).toEqual(["Зарегистрироваться", "Анкета откроется 11-01", false]);
    expect(landingCta(stage("upcoming", { opensAt: null }), null, format).status).toBe("Анкета скоро откроется");
  });

  it("закрыта — вход в кабинет", () => {
    expect(landingCta(stage("closed"), null, format)).toMatchObject({ label: "Войти в кабинет", status: "Приём анкет завершён" });
  });

  it("вошедшему — его кабинет, кандидату и организатору свой", () => {
    expect(landingCta(stage("open"), { isStaff: false }, format)).toMatchObject({ label: "Мой кабинет", to: "/cabinet" });
    expect(landingCta(stage("open"), { isStaff: true }, format)).toMatchObject({ label: "Кабинет организатора", to: "/staff" });
  });

  it("вошёл через Telegram, но не зарегистрировался — к знакомству", () => {
    expect(landingCta(stage("open"), { isStaff: false, needsProfile: true }, format)).toMatchObject({
      label: "Зарегистрироваться",
      to: "/cabinet/welcome",
    });
  });

  it("без сезона — как будто анкета скоро", () => {
    expect(landingCta([], null, format)).toMatchObject({ label: "Зарегистрироваться", status: "Анкета скоро откроется" });
  });
});
