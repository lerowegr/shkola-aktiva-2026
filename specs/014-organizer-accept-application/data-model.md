# Данные

Используются существующие Application, Answer, Submission, Review, AssessmentInvite и AuditLog. Новых столбцов и миграций нет. Application.status переходит из DRAFT в SUBMITTED с фактическим временем принятия; AuditLog указывает actorId и action application.accept_by_staff. Наличие ДЗ устанавливается только из действительной сохранённой ссылки, без фиктивной Submission.
