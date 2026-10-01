import path from "node:path";
import { rmSync } from "node:fs";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { publishDecisions, setDecision } from "./decisions";
import { loadHomework, submitHomework } from "./homework";
import { listApplications } from "./staff";

process.env.UPLOADS_DIR = path.resolve("test-results/uploads-hw");
afterAll(() => rmSync(process.env.UPLOADS_DIR!, { recursive: true, force: true }));

const pdf = { filename: "ДЗ.pdf", data: new TextEncoder().encode("%PDF-1.7\n%%EOF") };
let seasonId: string;
let masterRole: string;

beforeEach(async () => {
  await resetDatabase();
  const season = await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } });
  seasonId = season.id;
  await db.stage.create({
    data: { seasonId, kind: "HOMEWORK", title: "ДЗ", order: 2, mode: "OPEN", description: "Сделайте афишу" },
  });
  masterRole = (await db.role.create({ data: { name: "М", slug: "m", permissions: ["applications.review"] } })).id;
});

async function setup(outcome: "PASSED" | "REJECTED" | null) {
  const katya = await db.user.create({ data: { firstName: "Катя", roles: { create: { roleId: masterRole } } } });
  await db.user.create({ data: { firstName: "Илья", roles: { create: { roleId: masterRole } } } });
  const user = await db.user.create({ data: { firstName: "Алина" } });
  const application = await db.application.create({
    data: { seasonId, userId: user.id, status: "SUBMITTED", lastName: "Смирнова", firstName: "Алина" },
  });
  await db.review.create({ data: { applicationId: application.id, stageKind: "APPLICATION", reviewerId: katya.id } });
  if (outcome) {
    await setDecision(application.id, "APPLICATION", outcome, katya.id);
    await publishDecisions(seasonId, "APPLICATION");
  }
  return { user, application, katya };
}

describe("домашнее задание", () => {
  it("без опубликованного прохода — нельзя и задания не видно", async () => {
    const { user } = await setup(null);
    const view = await loadHomework(user.id);
    expect(view).toMatchObject({ admission: null, task: null, canSubmit: false });
    expect(await submitHomework({ userId: user.id, file: pdf, text: null, via: "SITE" })).toMatchObject({ ok: false });
  });

  it("не прошедшему — нельзя", async () => {
    const { user } = await setup("REJECTED");
    expect(await submitHomework({ userId: user.id, file: pdf, text: null, via: "SITE" })).toMatchObject({ ok: false });
  });

  it("прошедший сдаёт; работа уходит мастеру его анкеты", async () => {
    const { user, application, katya } = await setup("PASSED");
    expect((await loadHomework(user.id))?.task).toBe("Сделайте афишу");

    expect(await submitHomework({ userId: user.id, file: pdf, text: "Ссылка на макет", via: "SITE" })).toMatchObject({ ok: true });

    const review = await db.review.findFirstOrThrow({ where: { applicationId: application.id, stageKind: "HOMEWORK" } });
    expect(review.reviewerId).toBe(katya.id);
  });

  it("пересдача делает новую версию текущей, старая остаётся в истории", async () => {
    const { user } = await setup("PASSED");
    await submitHomework({ userId: user.id, file: pdf, text: null, via: "SITE" });
    await submitHomework({ userId: user.id, file: null, text: "Исправленная версия", via: "TELEGRAM" });

    const view = await loadHomework(user.id);
    expect(view?.submissions.map((item) => item.current)).toEqual([true, false]);
    expect(view?.submissions[0]?.text).toBe("Исправленная версия");
    expect(await db.review.count({ where: { stageKind: "HOMEWORK" } })).toBe(1);
  });

  it("в «Центр оценки» попадают только сдавшие, и оценка ДЗ отдельно от анкеты", async () => {
    const { user, katya } = await setup("PASSED");
    const list = () => listApplications({ seasonId, viewerId: katya.id, scope: "mine", filter: "all", query: "", stage: "HOMEWORK" });

    expect((await list()).rows).toHaveLength(0);
    await submitHomework({ userId: user.id, file: pdf, text: null, via: "SITE" });
    const rows = (await list()).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.summary.status).toBe("new");
  });

  it("закрытый этап — нельзя", async () => {
    const { user } = await setup("PASSED");
    await db.stage.updateMany({ where: { kind: "HOMEWORK" }, data: { mode: "CLOSED" } });
    expect(await submitHomework({ userId: user.id, file: pdf, text: null, via: "SITE" })).toMatchObject({ ok: false });
  });

  it("пустая сдача — нельзя", async () => {
    const { user } = await setup("PASSED");
    expect(await submitHomework({ userId: user.id, file: null, text: "  ", via: "SITE" })).toMatchObject({ ok: false });
  });
});
