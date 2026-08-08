import { CARDS } from './cards.js';
import { EXPERIMENTAL_CARDS } from './experimental.js';
import type { CardDef } from './types.js';

export * from './types.js';
export { CARDS } from './cards.js';
export { EXPERIMENTAL_CARDS } from './experimental.js';
export * from './campaign.js';

/** Every card the game knows about, base set plus accepted experiments. */
export const ALL_CARDS: readonly CardDef[] = [...CARDS, ...EXPERIMENTAL_CARDS];

const BY_ID = new Map<string, CardDef>(ALL_CARDS.map((c) => [c.id, c]));

if (BY_ID.size !== ALL_CARDS.length) {
  const seen = new Set<string>();
  const dupes = ALL_CARDS.filter((c) => (seen.has(c.id) ? true : (seen.add(c.id), false)));
  throw new Error(`Duplicate card ids: ${dupes.map((c) => c.id).join(', ')}`);
}

export function getCard(id: string): CardDef {
  const card = BY_ID.get(id);
  if (!card) throw new Error(`Unknown card id: ${id}`);
  return card;
}

export function tryGetCard(id: string): CardDef | undefined {
  return BY_ID.get(id);
}

export function cardIds(): string[] {
  return [...BY_ID.keys()];
}
