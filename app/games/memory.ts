import { shuffled, type Rng } from "./rng";

/**
 * «Пары»: найти одинаковые карточки. Ход — открыть вторую карточку пары.
 * Не совпали — обе остаются открытыми, пока игрок не откроет следующую
 * (или пока интерфейс не закроет их по таймеру через settle).
 */
export interface MemoryCard {
  id: number;
  face: string;
  matched: boolean;
}

export interface MemoryState {
  cards: MemoryCard[];
  /** Открытые, но ещё не угаданные карточки: 0, 1 или 2 индекса. */
  open: number[];
  moves: number;
  pairs: number;
}

export type FlipEvent = "open" | "match" | "miss" | "ignored";

export function createMemory(faces: readonly string[], rng: Rng): MemoryState {
  const cards = shuffled([...faces, ...faces], rng).map((face, id) => ({ id, face, matched: false }));
  return { cards, open: [], moves: 0, pairs: 0 };
}

export function isOpen(state: MemoryState, index: number): boolean {
  return state.open.includes(index) || state.cards[index]!.matched;
}

/** Закрыть несовпавшую пару. */
export function settle(state: MemoryState): MemoryState {
  return state.open.length === 2 ? { ...state, open: [] } : state;
}

export function flip(state: MemoryState, index: number): { state: MemoryState; event: FlipEvent } {
  const card = state.cards[index];
  if (!card || card.matched) return { state, event: "ignored" };
  // Открытую карточку второй раз не открыть — кроме несовпавшей пары: нажатие
  // на любую карточку после промаха закрывает пару и начинает новую попытку.
  if (state.open.length < 2 && state.open.includes(index)) return { state, event: "ignored" };

  const base = settle(state);
  if (base.open.length === 0) return { state: { ...base, open: [index] }, event: "open" };

  const first = base.cards[base.open[0]!]!;
  const moves = base.moves + 1;
  if (first.face === card.face) {
    const cards = base.cards.map((item) => (item.face === card.face ? { ...item, matched: true } : item));
    return { state: { cards, open: [], moves, pairs: base.pairs + 1 }, event: "match" };
  }
  return { state: { ...base, open: [base.open[0]!, index], moves }, event: "miss" };
}

export function memoryDone(state: MemoryState): boolean {
  return state.cards.every((card) => card.matched);
}
