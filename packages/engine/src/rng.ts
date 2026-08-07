/**
 * Deterministic RNG. The whole engine is reproducible from a single seed string,
 * which is what makes server-authoritative play and balance simulation possible.
 */

/** FNV-1a — turns a seed string into a 32-bit integer. */
export function hashSeed(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** Uniform pick. Throws on an empty array. */
  pick<T>(items: readonly T[]): T;
  /** In-place Fisher-Yates. Returns the same array. */
  shuffle<T>(items: T[]): T[];
  /** Current internal state, so a match can be serialized mid-flight. */
  state(): number;
}

/** mulberry32 — small, fast, good enough for a card game. */
export function createRng(seed: string | number, state?: number): Rng {
  let s = state ?? (typeof seed === 'number' ? seed >>> 0 : hashSeed(seed));

  const next = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (maxExclusive: number): number => {
    if (maxExclusive <= 0) return 0;
    return Math.floor(next() * maxExclusive) % maxExclusive;
  };

  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick on empty array');
      return items[int(items.length)] as T;
    },
    shuffle<T>(items: T[]): T[] {
      for (let i = items.length - 1; i > 0; i--) {
        const j = int(i + 1);
        const a = items[i] as T;
        const b = items[j] as T;
        items[i] = b;
        items[j] = a;
      }
      return items;
    },
    state: () => s,
  };
}

/** Weighted pick without replacement bookkeeping; weights must be > 0. */
export function weightedPick<T>(rng: Rng, items: readonly T[], weightOf: (item: T) => number): T {
  let total = 0;
  for (const item of items) total += Math.max(0, weightOf(item));
  if (total <= 0) return rng.pick(items);
  let roll = rng.next() * total;
  for (const item of items) {
    roll -= Math.max(0, weightOf(item));
    if (roll < 0) return item;
  }
  return items[items.length - 1] as T;
}
