-- Этап «Центр оценки» между домашним заданием и собеседованием —
-- в уже созданных сезонах. Собеседование и итоги сдвигаются на шаг.
UPDATE "stages" SET "order" = "order" + 1
WHERE "kind" IN ('INTERVIEW', 'RESULTS')
  AND "seasonId" NOT IN (SELECT "seasonId" FROM "stages" WHERE "kind" = 'ASSESSMENT');

INSERT INTO "stages" ("id", "seasonId", "kind", "title", "order", "mode", "createdAt", "updatedAt")
SELECT 'st_assessment_' || s."id", s."id", 'ASSESSMENT', 'Центр оценки',
       COALESCE((SELECT h."order" + 1 FROM "stages" h WHERE h."seasonId" = s."id" AND h."kind" = 'HOMEWORK'), 3),
       'AUTO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "seasons" s
WHERE NOT EXISTS (SELECT 1 FROM "stages" x WHERE x."seasonId" = s."id" AND x."kind" = 'ASSESSMENT');
