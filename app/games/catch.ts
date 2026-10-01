import { CATCH_SECONDS } from "~~/lib/games/rules";

import type { Rng } from "./rng";

/**
 * «Лови»: сверху падают стеклянные объекты, маскот внизу ловит их.
 * Обычный объект +1, звёздочка +3, тёмная молния −3. Со временем падают
 * чаще и быстрее. Поле — в долях: ширина 1, высота 1, маскот на высоте 0.88.
 * Время — игровое, на паузе не идёт, поэтому партия всегда 45 секунд.
 */
export type ItemKind = "heart" | "asterisk" | "moon" | "star" | "bolt";

export interface FallingItem {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  speed: number;
  spin: number;
}

export interface CatchState {
  time: number;
  score: number;
  player: number;
  items: FallingItem[];
  nextSpawn: number;
  nextId: number;
  over: boolean;
}

export const POINTS: Record<ItemKind, number> = { heart: 1, asterisk: 1, moon: 1, star: 3, bolt: -3 };
export const PLAYER_Y = 0.88;
export const PLAYER_WIDTH = 0.2;
export const ITEM_SIZE = 0.11;
const PLAYER_SPEED = 2.4;

export function createCatch(): CatchState {
  return { time: 0, score: 0, player: 0.5, items: [], nextSpawn: 0.4, nextId: 1, over: false };
}

function pickKind(rng: Rng): ItemKind {
  const roll = rng();
  if (roll < 0.22) return "bolt";
  if (roll < 0.3) return "star";
  return (["heart", "asterisk", "moon"] as const)[Math.floor(rng() * 3)]!;
}

/** Один шаг: dt — секунды, target — куда тянется маскот (0…1). */
export function stepCatch(
  state: CatchState,
  dt: number,
  target: number,
  rng: Rng,
): { state: CatchState; events: ItemKind[] } {
  if (state.over) return { state, events: [] };

  const time = Math.min(state.time + dt, CATCH_SECONDS);
  const progress = time / CATCH_SECONDS;
  const reach = PLAYER_SPEED * dt;
  const half = PLAYER_WIDTH / 2;
  const goal = Math.min(1 - half, Math.max(half, target));
  const player = state.player + Math.max(-reach, Math.min(reach, goal - state.player));

  let { nextSpawn, nextId } = state;
  const items = state.items.map((item) => ({ ...item, y: item.y + item.speed * dt }));
  nextSpawn -= dt;
  while (nextSpawn <= 0) {
    items.push({
      id: nextId++,
      kind: pickKind(rng),
      x: ITEM_SIZE / 2 + rng() * (1 - ITEM_SIZE),
      y: -ITEM_SIZE,
      speed: 0.32 + progress * 0.38 + rng() * 0.12,
      spin: (rng() - 0.5) * 3,
    });
    nextSpawn += 0.85 - progress * 0.45;
  }

  // Пойман — центр объекта на уровне маскота и над его шириной.
  const events: ItemKind[] = [];
  const kept = items.filter((item) => {
    const caught = Math.abs(item.y - PLAYER_Y) < ITEM_SIZE * 0.6 && Math.abs(item.x - player) < half + ITEM_SIZE * 0.3;
    if (caught) events.push(item.kind);
    return !caught && item.y < 1 + ITEM_SIZE;
  });

  const score = state.score + events.reduce((sum, kind) => sum + POINTS[kind], 0);
  return {
    state: { time, score, player, items: kept, nextSpawn, nextId, over: time >= CATCH_SECONDS },
    events,
  };
}
