import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { listAudit } from "./audit";

beforeEach(resetDatabase);

describe("журнал", () => {
  it("подписывает, над кем действие: кандидат по оценке, человек, роль; удалённое — без имени", async () => {
    const season = await db.season.create({ data: { slug: "s", title: "S", year: 2026, isCurrent: true } });
    const master = await db.user.create({ data: { firstName: "Катя" } });
    const candidate = await db.user.create({ data: { email: "c@x.ru" } });
    const application = await db.application.create({
      data: { seasonId: season.id, userId: candidate.id, lastName: "Иванов", firstName: "Иван" },
    });
    const review = await db.review.create({
      data: { applicationId: application.id, stageKind: "APPLICATION", reviewerId: master.id },
    });
    const role = await db.role.create({ data: { name: "Наблюдатель", slug: "watch", permissions: [] } });

    const at = (seconds: number) => new Date(Date.UTC(2026, 9, 1, 12, 0, seconds));
    await db.auditLog.createMany({
      data: [
        { action: "review.score", actorId: master.id, entityType: "review", entityId: review.id, createdAt: at(1) },
        { action: "role.grant", entityType: "user", entityId: candidate.id, createdAt: at(2) },
        { action: "role.update", entityType: "role", entityId: role.id, createdAt: at(3) },
        { action: "role.delete", entityType: "role", entityId: "gone", createdAt: at(4) },
      ],
    });

    const { rows } = await listAudit({});
    expect(rows.map((row) => [row.action, row.subject])).toEqual([
      ["role.delete", null],
      ["role.update", "Наблюдатель"],
      ["role.grant", "c@x.ru"],
      ["review.score", "Иванов Иван"],
    ]);
    expect(rows.at(-1)?.actor).toBe("Катя");
  });
});
