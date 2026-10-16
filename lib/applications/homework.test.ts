import path from "node:path";
import { rmSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { assignFollowUp } from "./assign";
import { hasHomework, loadHomework, submitHomework } from "./homework";
import { listApplications } from "./staff";

process.env.UPLOADS_DIR = path.resolve("test-results/uploads-hw");
afterAll(() => rmSync(process.env.UPLOADS_DIR!, { recursive: true, force: true }));

const pdf = { filename: "ДЗ.pdf", data: new TextEncoder().encode("%PDF-1.7\n%%EOF") };
let seasonId: string;
let masterRole: string;

beforeEach(async () => {
  await resetDatabase();
  seasonId = (await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } })).id;
  await db.stage.create({ data: { seasonId, kind: "APPLICATION", title: "Анкета", order: 1, mode: "OPEN" } });
  // Даты этапа ДЗ ни на что не влияют: домашка живёт по приёму анкет.
  await db.stage.create({ data: { seasonId, kind: "HOMEWORK", title: "ДЗ", order: 2, mode: "CLOSED", description: "Сделайте афишу" } });
  masterRole = (await db.role.create({ data: { name: "М", slug: "m", permissions: ["applications.review"] } })).id;
});

const candidate = () => db.user.create({ data: { firstName: "Алина" } });

describe("домашнее задание — часть анкеты", () => {
  it("задание видно сразу, сдаётся в черновик анкеты — без мастера и решений", async () => {
    const user = await candidate();
    expect(await loadHomework(user.id)).toMatchObject({ task: "Сделайте афишу", canSubmit: true, sent: false, submissions: [] });

    expect(await submitHomework({ userId: user.id, file: pdf, text: "Ссылка на макет", via: "SITE" })).toMatchObject({ ok: true });
    const application = await db.application.findFirstOrThrow({ where: { userId: user.id } });
    expect(application.status).toBe("DRAFT");
    expect(await hasHomework(application.id)).toBe(true);
    // Мастер ДЗ назначается при отправке анкеты, не при прикреплении.
    expect(await db.review.count({ where: { stageKind: "HOMEWORK" } })).toBe(0);
  });

  it("замена до отправки делает новую версию текущей, старая — в истории", async () => {
    const user = await candidate();
    await submitHomework({ userId: user.id, file: pdf, text: null, via: "SITE" });
    await submitHomework({ userId: user.id, file: null, text: "Исправленная версия", via: "TELEGRAM" });
    const view = await loadHomework(user.id);
    expect(view?.submissions.map((item) => item.current)).toEqual([true, false]);
    expect(view?.submissions[0]?.text).toBe("Исправленная версия");
  });

  it("после отправки анкеты домашка не меняется", async () => {
    const user = await candidate();
    await submitHomework({ userId: user.id, file: pdf, text: null, via: "SITE" });
    await db.application.updateMany({ where: { userId: user.id }, data: { status: "SUBMITTED", submittedAt: new Date() } });
    expect(await loadHomework(user.id)).toMatchObject({ sent: true, canSubmit: false });
    expect(await submitHomework({ userId: user.id, file: pdf, text: null, via: "SITE" })).toMatchObject({ ok: false });
  });

  it("приём анкет закрыт — нельзя; пустая сдача — нельзя", async () => {
    const user = await candidate();
    expect(await submitHomework({ userId: user.id, file: null, text: "  ", via: "SITE" })).toMatchObject({ ok: false });
    await db.stage.updateMany({ where: { kind: "APPLICATION" }, data: { mode: "CLOSED" } });
    expect(await submitHomework({ userId: user.id, file: pdf, text: null, via: "SITE" })).toMatchObject({ ok: false });
  });

  it("после отправки работа уходит мастеру анкеты, в «Оценке ДЗ» — только отправленные", async () => {
    const katya = await db.user.create({ data: { firstName: "Катя", roles: { create: { roleId: masterRole } } } });
    const user = await candidate();
    await submitHomework({ userId: user.id, file: pdf, text: null, via: "SITE" });
    const list = () => listApplications({ seasonId, viewerId: katya.id, scope: "all", filter: "all", query: "", stage: "HOMEWORK" });
    expect((await list()).rows).toHaveLength(0);

    const application = await db.application.update({
      where: { seasonId_userId: { seasonId, userId: user.id } },
      data: { status: "SUBMITTED", submittedAt: new Date() },
    });
    await db.review.create({ data: { applicationId: application.id, stageKind: "APPLICATION", reviewerId: katya.id } });
    const review = await assignFollowUp(application.id, "HOMEWORK");
    expect(review?.reviewerId).toBe(katya.id);
    expect((await list()).rows).toHaveLength(1);
  });
});
