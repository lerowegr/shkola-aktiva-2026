-- Маркеры из таблицы «Портрет участника ША'26» (лист «характеристики + маркеры»).
--
-- ДЗ: Оформление, Самостоятельность → Завозность, Мотивация, Девиантность.
-- Собес: Сильные стороны, Что насторожило, Куда направить → пять экселевских.
-- Анкета: убрать «Использование ГПТ».
-- Удаление — только неиспользуемых (с заметками не трогаем).

-- ДЗ: убрать старые.
DELETE FROM markers
WHERE "stageKind" = 'HOMEWORK'
  AND title IN ('Оформление', 'Самостоятельность')
  AND "seasonId" = (SELECT id FROM seasons WHERE "isCurrent" LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM review_markers rm WHERE rm."markerId" = markers.id);

-- ДЗ: добавить экселевские.
INSERT INTO markers (id, "seasonId", "stageKind", "order", title, example)
SELECT gen_random_uuid()::text, s.id, 'HOMEWORK', v."order", v.title, v.example
FROM (SELECT id FROM seasons WHERE "isCurrent" LIMIT 1) s
CROSS JOIN (VALUES
  (1, 'Завозность', 'Кандидат старается поднять динамику, генерирует шутки и завозные идеи, кандидат активный, харизматичный и забавный'),
  (2, 'Мотивация', 'Кандидат понимает, зачем ему нужна Школа Актива и что этот проект может ему дать. Чётко ставит перед собой цель на проект и может подробно объяснить, почему он хочет стать Участником.'),
  (3, 'Девиантность', 'Не агрессирует на других/не матерится/не кричит')
) AS v("order", title, example)
WHERE NOT EXISTS (
  SELECT 1 FROM markers m
  WHERE m."seasonId" = s.id AND m."stageKind" = 'HOMEWORK' AND m.title = v.title
);

-- Собес: убрать старые.
DELETE FROM markers
WHERE "stageKind" = 'INTERVIEW'
  AND title IN ('Сильные стороны', 'Что насторожило', 'Куда направить')
  AND "seasonId" = (SELECT id FROM seasons WHERE "isCurrent" LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM review_markers rm WHERE rm."markerId" = markers.id);

-- Собес: добавить экселевские.
INSERT INTO markers (id, "seasonId", "stageKind", "order", title, example)
SELECT gen_random_uuid()::text, s.id, 'INTERVIEW', v."order", v.title, v.example
FROM (SELECT id FROM seasons WHERE "isCurrent" LIMIT 1) s
CROSS JOIN (VALUES
  (1, 'Завозность', 'Кандидат старается поднять динамику, генерирует шутки и завозные идеи, кандидат активный, харизматичный и забавный'),
  (2, 'Публичные выступления', 'Кандидат может представить себя перед публикой, держится стойко и не стесняется. Логично выражает свои мысли, громко говорит, применяет жестикуляцию'),
  (3, 'Опыт участия в похожей деятельности', 'Кандидат принимал участие в проектах школьного или студенческого самоуправления. В школе принимал участие в школьном самоуправлении/был волонтером/организатором мероприятий.'),
  (4, 'Мотивация', 'Кандидат понимает, зачем ему нужна Школа Актива и что этот проект может ему дать. Чётко ставит перед собой цель на проект и может подробно объяснить, почему он хочет стать Участником.'),
  (5, 'Девиантность', 'Не агрессирует на других/не матерится/не кричит')
) AS v("order", title, example)
WHERE NOT EXISTS (
  SELECT 1 FROM markers m
  WHERE m."seasonId" = s.id AND m."stageKind" = 'INTERVIEW' AND m.title = v.title
);

-- Анкета: убрать «Использование ГПТ».
DELETE FROM markers
WHERE "stageKind" = 'APPLICATION'
  AND title = 'Использование ГПТ'
  AND "seasonId" = (SELECT id FROM seasons WHERE "isCurrent" LIMIT 1)
  AND NOT EXISTS (SELECT 1 FROM review_markers rm WHERE rm."markerId" = markers.id);
