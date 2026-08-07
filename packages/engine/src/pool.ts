import type { CardDef } from '@delezh/cards';
import { weightedPick, type Rng } from './rng.js';
import type { CardInstance } from './types.js';

/**
 * Builds the match pool: `rounds × rowSize` cards drawn from the weighted pool.
 *
 * Rules that keep a pool readable:
 *  - a card never appears twice in the same row (nothing to think about there);
 *  - a card never exceeds its own `maxCopies` across the whole match.
 *
 * Fully determined by the RNG, so the same seed always yields the same match.
 */
export function buildRows(
  rng: Rng,
  cards: readonly CardDef[],
  rounds: number,
  rowSize: number,
): CardInstance[][] {
  if (cards.length < rowSize) {
    throw new Error(`Card pool too small: need at least ${rowSize} distinct cards`);
  }

  const used = new Map<string, number>();
  const rows: CardInstance[][] = [];

  for (let row = 0; row < rounds; row++) {
    const inRow = new Set<string>();
    const slots: CardInstance[] = [];

    for (let slot = 0; slot < rowSize; slot++) {
      const candidates = cards.filter(
        (c) => !inRow.has(c.id) && (used.get(c.id) ?? 0) < c.maxCopies,
      );
      // Copy caps can starve the pool late in a long match; fall back to the
      // per-row uniqueness constraint alone rather than failing to build a row.
      const usable = candidates.length > 0 ? candidates : cards.filter((c) => !inRow.has(c.id));
      const picked = weightedPick(rng, usable, (c) => c.weight);

      inRow.add(picked.id);
      used.set(picked.id, (used.get(picked.id) ?? 0) + 1);
      slots.push({ uid: `r${row}s${slot}`, cardId: picked.id, row, slot });
    }

    // Shuffle slot order so weight-driven draw order does not leak information.
    rng.shuffle(slots);
    slots.forEach((card, index) => {
      card.slot = index;
      card.uid = `r${row}s${index}`;
    });

    rows.push(slots);
  }

  return rows;
}
