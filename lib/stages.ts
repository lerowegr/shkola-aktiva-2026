import { db } from "~~/lib/db";
import type { StageKind, StageMode } from "~~/lib/generated/prisma/enums";

/**
 * Этапы отбора и их замки.
 *
 * Состояние этапа не хранится, а вычисляется: хранимое «открыт» кто-то
 * должен вовремя переключить, и однажды это забудут сделать в полночь
 * дедлайна. Вычисленное по датам переключается само, а ручной режим
 * остаётся на случай «продлим на день» или «закрываем досрочно».
 */
export type StageState = "upcoming" | "open" | "closed";

export interface StageTiming {
  mode: StageMode;
  opensAt: Date | null;
  closesAt: Date | null;
}

export function stageState(stage: StageTiming, now: Date = new Date()): StageState {
  if (stage.mode === "OPEN") return "open";
  if (stage.mode === "CLOSED") return "closed";

  if (!stage.opensAt || now < stage.opensAt) return "upcoming";
  if (stage.closesAt && now >= stage.closesAt) return "closed";
  return "open";
}

export interface SeasonStage {
  id: string;
  kind: StageKind;
  title: string;
  order: number;
  opensAt: Date | null;
  closesAt: Date | null;
  state: StageState;
}

export interface CurrentSeason {
  id: string;
  slug: string;
  title: string;
  year: number;
  stages: SeasonStage[];
}

/** Текущий сезон с этапами по порядку и их состоянием на сейчас. */
export async function currentSeason(now: Date = new Date()): Promise<CurrentSeason | null> {
  const season = await db.season.findFirst({
    where: { isCurrent: true },
    select: {
      id: true,
      slug: true,
      title: true,
      year: true,
      stages: {
        orderBy: { order: "asc" },
        select: { id: true, kind: true, title: true, order: true, opensAt: true, closesAt: true, mode: true },
      },
    },
  });

  if (!season) return null;

  return {
    ...season,
    stages: season.stages.map(({ mode, ...stage }) => ({
      ...stage,
      state: stageState({ mode, opensAt: stage.opensAt, closesAt: stage.closesAt }, now),
    })),
  };
}
