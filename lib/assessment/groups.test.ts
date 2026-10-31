import { beforeEach, describe, expect, it } from "vitest";

import { db } from "~~/lib/db";
import { resetDatabase } from "~~/lib/test/db";

import { deleteGroup, placeMember, saveGroup, setExperts } from "./groups";

describe("подгруппы центра оценки", () => {
  let seasonId: string;
  let roleId: string;
  let criterionId: string;
  let sessionId: string;

  beforeEach(async () => {
    await resetDatabase();
    seasonId = (
      await db.season.create({
        data: { slug: "s", title: "S", year: 2026, isCurrent: true },
      })
    ).id;
    roleId = (
      await db.role.create({
        data: {
          name: "Мастер",
          slug: "master",
          permissions: ["applications.review"],
        },
      })
    ).id;
    criterionId = (
      await db.criterion.create({
        data: {
          seasonId,
          stageKind: "ASSESSMENT",
          order: 1,
          title: "Командность",
          maxScore: 2,
          levels: [],
        },
      })
    ).id;
    sessionId = (
      await db.assessmentSession.create({
        data: {
          seasonId,
          title: "Сбор",
          startsAt: new Date("2026-11-02T15:00:00Z"),
          faculties: ["МЭО"],
        },
      })
    ).id;
  });

  const expert = (name: string) =>
    db.user.create({
      data: { firstName: name, roles: { create: { roleId } } },
    });
  /** Кандидат, приглашённый на сбор и ответивший «буду». */
  async function candidate(name: string, session = sessionId) {
    const faculty = (await db.assessmentSession.findUniqueOrThrow({ where: { id: session }, select: { faculties: true } })).faculties[0] ?? "МЭО";
    const user = await db.user.create({ data: { firstName: name, faculty } });
    const application = await db.application.create({
      data: {
        seasonId,
        userId: user.id,
        firstName: name,
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });
    await db.assessmentInvite.create({
      data: {
        sessionId: session,
        applicationId: application.id,
        answer: "GOING",
      },
    });
    return application;
  }
  async function group(title: string, session = sessionId) {
    const faculty = (await db.assessmentSession.findUniqueOrThrow({ where: { id: session }, select: { faculties: true } })).faculties[0] ?? "МЭО";
    const result = await saveGroup(seasonId, { sessionId: session, title, faculty });
    if (!result.ok) throw new Error(result.message);
    return result.id;
  }

  it("подгруппа — только в сборе этого сезона; заготовки оценок экспертам, отметка «пришёл»", async () => {
    expect(
      await saveGroup(seasonId, { sessionId: "нет-такого", title: "Х" }),
    ).toMatchObject({ ok: false });
    const g = await group("Подгруппа 1");
    const kate = await expert("Катя");
    await setExperts(seasonId, g, [kate.id], kate.id);
    const a = await candidate("А");
    await placeMember(seasonId, a.id, g, kate.id);
    expect(
      await db.review.count({
        where: { stageKind: "ASSESSMENT", reviewerId: kate.id },
      }),
    ).toBe(1);
    expect(
      (
        await db.assessmentInvite.findUniqueOrThrow({
          where: { applicationId: a.id },
        })
      ).attended,
    ).toBe(true);
  });

  it("класть можно только в подгруппу своего дня; резервный день — по ответу", async () => {
    const other = (
      await db.assessmentSession.create({
        data: {
          seasonId,
          title: "Другой",
          startsAt: new Date("2026-11-03T15:00:00Z"),
          faculties: ["ЮФ"],
        },
      })
    ).id;
    const reserve = (
      await db.assessmentSession.create({
        data: {
          seasonId,
          title: "Резерв",
          startsAt: new Date("2026-10-31T09:00:00Z"),
          reserve: true,
        },
      })
    ).id;
    const here = await group("Здесь");
    const there = await group("Там", other);
    const spare = await group("Резерв", reserve);
    const a = await candidate("А");

    expect(await placeMember(seasonId, a.id, there, null)).toMatchObject({
      ok: false,
    });
    expect(await placeMember(seasonId, a.id, here, null)).toMatchObject({
      ok: true,
    });

    await db.assessmentInvite.update({
      where: { applicationId: a.id },
      data: { answer: "RESERVE" },
    });
    await db.assessmentInvite.update({
      where: { applicationId: a.id },
      data: { reserveQueued: true },
    });
    expect(await placeMember(seasonId, a.id, spare, null)).toMatchObject({
      ok: false,
    });
    await db.assessmentInvite.update({
      where: { applicationId: a.id },
      data: { reserveQueued: false },
    });
    expect(await placeMember(seasonId, a.id, spare, null)).toMatchObject({
      ok: true,
      to: "Резерв",
    });

    const uninvited = await db.application.create({
      data: {
        seasonId,
        userId: (await db.user.create({ data: {} })).id,
        status: "SUBMITTED",
        submittedAt: new Date(),
      },
    });
    expect(await placeMember(seasonId, uninvited.id, here, null)).toMatchObject(
      { ok: false },
    );
  });

  it("в резервный день общая подгруппа принимает кандидатов всех факультетов", async () => {
    const reserve = (
      await db.assessmentSession.create({
        data: {
          seasonId,
          title: "Резерв",
          startsAt: new Date("2026-10-31T09:00:00Z"),
          reserve: true,
        },
      })
    ).id;
    const saved = await saveGroup(seasonId, { sessionId: reserve, title: "Все факультеты" });
    expect(saved).toMatchObject({ ok: true });
    const general = saved.ok ? saved.id : "";

    // Кандидаты разных факультетов ответили «приду в резервный день».
    const people = await Promise.all(
      ["ЮФ", "ВШУ"].map(async (faculty) => {
        const user = await db.user.create({ data: { firstName: faculty, faculty } });
        const application = await db.application.create({
          data: {
            seasonId,
            userId: user.id,
            firstName: faculty,
            status: "SUBMITTED",
            submittedAt: new Date(),
          },
        });
        await db.assessmentInvite.create({
          data: { sessionId, applicationId: application.id, answer: "RESERVE" },
        });
        return application;
      }),
    );
    for (const person of people) {
      expect(await placeMember(seasonId, person.id, general, null)).toMatchObject({
        ok: true,
        to: "Все факультеты",
      });
    }
  });

  it("эксперта с начатой оценкой снять нельзя, без оценок — можно", async () => {
    const g = await group("Группа");
    const kate = await expert("Катя");
    const ilya = await expert("Илья");
    const a = await candidate("А");
    await placeMember(seasonId, a.id, g, kate.id);
    await setExperts(seasonId, g, [kate.id, ilya.id], kate.id);

    const review = await db.review.findFirstOrThrow({
      where: { reviewerId: kate.id, stageKind: "ASSESSMENT" },
    });
    await db.reviewScore.create({
      data: { reviewId: review.id, criterionId, score: 2 },
    });

    expect(await setExperts(seasonId, g, [ilya.id], kate.id)).toMatchObject({
      ok: false,
    });
    expect(await setExperts(seasonId, g, [kate.id], kate.id)).toMatchObject({
      ok: true,
      removed: [ilya.id],
    });
    expect(await db.review.count({ where: { reviewerId: ilya.id } })).toBe(0);
  });

  it("перенос: пустые заготовки уходят, начатые остаются", async () => {
    const [g1, g2] = [await group("1"), await group("2")];
    const [kate, ilya, olya] = [
      await expert("Катя"),
      await expert("Илья"),
      await expert("Оля"),
    ];
    await setExperts(seasonId, g1, [kate.id, ilya.id], kate.id);
    await setExperts(seasonId, g2, [olya.id], kate.id);
    const a = await candidate("А");
    await placeMember(seasonId, a.id, g1, kate.id);

    const started = await db.review.findFirstOrThrow({
      where: { reviewerId: kate.id },
    });
    await db.review.update({
      where: { id: started.id },
      data: { comment: "Хорош в команде" },
    });

    const moved = await placeMember(seasonId, a.id, g2, kate.id);
    expect(moved).toMatchObject({ ok: true, from: "1", to: "2", kept: 1 });
    const reviewers = (
      await db.review.findMany({
        where: { applicationId: a.id },
        select: { reviewerId: true },
      })
    ).map((r) => r.reviewerId);
    expect(reviewers.sort()).toEqual([kate.id, olya.id].sort());
  });

  it("подгруппу удалить можно и с кандидатами: они — нераспределённые, начатые оценки остаются", async () => {
    const g = await group("Группа");
    const kate = await expert("Катя");
    await setExperts(seasonId, g, [kate.id], kate.id);
    const a = await candidate("А");
    const b = await candidate("Б");
    await placeMember(seasonId, a.id, g, kate.id);
    await placeMember(seasonId, b.id, g, kate.id);
    const started = await db.review.findFirstOrThrow({
      where: { applicationId: a.id, reviewerId: kate.id },
    });
    await db.review.update({
      where: { id: started.id },
      data: { comment: "Хорош в команде" },
    });

    expect(await deleteGroup(seasonId, g)).toMatchObject({
      ok: true,
      title: "Группа",
      members: 2,
      kept: 1,
    });
    expect(await db.assessmentGroup.count()).toBe(0);
    expect(await db.assessmentMember.count()).toBe(0);
    // Пустая заготовка Б убрана, начатая оценка А — на месте.
    expect(
      (
        await db.review.findMany({
          where: { stageKind: "ASSESSMENT" },
          select: { applicationId: true },
        })
      ).map((r) => r.applicationId),
    ).toEqual([a.id]);
    expect(await db.assessmentInvite.count()).toBe(2);
  });
});
