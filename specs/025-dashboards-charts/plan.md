# План
- R1 Агрегаты в lib/dashboards.ts: milestonesByDay (дни × 4 события), facultyMilestones (8 факультетов × 4 события), buildingMilestones (корпуса), masterInterviewsByDay, staffMasters. Группировка в JS — объёмы малы.
- R2 Компоненты: GroupedColumns (группы столбиков с легендой), DivergingBars (отклонения от центра). Существующие Columns/LineChart/Histogram/BarList переиспользуются.
- R3 Эндпоинт: параметры from, to, building, master; в payload добавляются milestones, facultyMilestones, buildings, masters, masterInterviews; DashboardPayload расширяется.
- R4 Страница: разделы «Прохождение», «Факультеты», «Мастера», «Собеседования»; фильтры мастер/корпус/период сверху; таблицы под графиками через DashTable.
- R5 CSV: отчёты flow и faculties в dashboards-export.
- R6 Тесты: новые агрегаты на тестовой базе (дни по Москве, фильтры факультета/корпуса/мастера).
