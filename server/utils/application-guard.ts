import { currentApplicationStage, draftFor } from "~~/lib/applications/candidate";
import type { CurrentUser } from "~~/lib/auth/actor";

/**
 * Можно ли кандидату сейчас менять анкету. Общая проверка для
 * автосохранения, профиля и отправки — чтобы правило жило в одном месте.
 */
export async function editableDraft(user: CurrentUser) {
  const current = await currentApplicationStage();

  if (!current) {
    return { ok: false as const, message: "Отбор ещё не начался." };
  }

  if (current.stage.state === "upcoming") {
    return { ok: false as const, message: "Приём анкет ещё не открыт." };
  }

  if (current.stage.state === "closed") {
    return { ok: false as const, message: "Приём анкет закрыт — изменения не сохранятся." };
  }

  const draft = await draftFor(user.id, current.seasonId);

  if (draft.status !== "DRAFT") {
    return { ok: false as const, message: "Анкета уже отправлена — менять её нельзя." };
  }

  return { ok: true as const, applicationId: draft.id, seasonId: current.seasonId };
}
