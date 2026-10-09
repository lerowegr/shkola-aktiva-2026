import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { releaseReview, saveScore, takeReview, transferReview } from "./review-store";

describe("биржа оценок", () => {
  let seasonId: string;
  let masterRoleId: string;

  beforeEach(async () => {
    await resetDatabase();
    const season = await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } });
    seasonId = season.id;
    masterRoleId = (
      await db.role.create({ data: { name: "Мастер", slug: "master", permissions: ["applications.review"] } })
    ).id;
  });

  async function master(name: string) {
    return db.user.create({ data: { firstName: name, roles: { create: { roleId: masterRoleId } } } });
  }

  async function application(status: "SUBMITTED" | "DRAFT" = "SUBMITTED") {
    const user = await db.user.create({ data: {} });
    return db.application.create({ data: { seasonId, userId: user.id, status, submittedAt: new Date() } });
  }

  it("взять можно отправленную; повтор — та же строка", async () => {
    const me = await master("Я");
    const app = await application();
    const first = await takeReview({ applicationId: app.id, stageKind: "APPLICATION", actorId: me.id });
    expect(first.ok).toBe(true);
    const second = await takeReview({ applicationId: app.id, stageKind: "APPLICATION", actorId: me.id });
    expect(second).toEqual(first);

    const draft = await application("DRAFT");
    expect(await takeReview({ applicationId: draft.id, stageKind: "APPLICATION", actorId: me.id })).toMatchObject({
      ok: false,
    });
  });

  it("передать — только мастеру, вместе со строкой", async () => {
    const me = await master("Я");
    const other = await master("Другой");
    const stranger = await db.user.create({ data: {} });
    const app = await application();
    const taken = await takeReview({ applicationId: app.id, stageKind: "APPLICATION", actorId: me.id });
    expect(taken.ok).toBe(true);
    if (!taken.ok) return;

    expect(await transferReview({ reviewId: taken.reviewId, actorId: me.id, toUserId: me.id })).toMatchObject({ ok: false });
    expect(await transferReview({ reviewId: taken.reviewId, actorId: me.id, toUserId: stranger.id })).toMatchObject({
      ok: false,
    });
    expect(await transferReview({ reviewId: taken.reviewId, actorId: me.id, toUserId: other.id })).toMatchObject({
      ok: true,
    });
    const row = await db.review.findUniqueOrThrow({ where: { id: taken.reviewId } });
    expect(row.reviewerId).toBe(other.id);
  });

  it("вернуть без сохранения — строка исчезает, с сохранением — замораживается", async () => {
    const me = await master("Я");
    const app = await application();
    const taken = await takeReview({ applicationId: app.id, stageKind: "APPLICATION", actorId: me.id });
    expect(taken.ok).toBe(true);
    if (!taken.ok) return;

    expect(await releaseReview({ reviewId: taken.reviewId, actorId: me.id, keep: false })).toEqual({ ok: true });
    expect(await db.review.findUnique({ where: { id: taken.reviewId } })).toBeNull();

    const again = await takeReview({ applicationId: app.id, stageKind: "APPLICATION", actorId: me.id });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(await releaseReview({ reviewId: again.reviewId, actorId: me.id, keep: true })).toEqual({ ok: true });
    const frozen = await db.review.findUniqueOrThrow({ where: { id: again.reviewId } });
    expect(frozen.releasedAt).not.toBeNull();
  });

  it("замороженную оценку менять нельзя", async () => {
    const me = await master("Я");
    const app = await application();
    const taken = await takeReview({ applicationId: app.id, stageKind: "APPLICATION", actorId: me.id });
    expect(taken.ok).toBe(true);
    if (!taken.ok) return;
    await releaseReview({ reviewId: taken.reviewId, actorId: me.id, keep: true });

    const criterion = await db.criterion.create({
      data: { seasonId, stageKind: "APPLICATION", order: 1, title: "К", maxScore: 4, levels: [] },
    });
    expect(await saveScore({ reviewId: taken.reviewId, actorId: me.id, criterionId: criterion.id, score: 2 })).toMatchObject({
      ok: false,
    });
  });
});
