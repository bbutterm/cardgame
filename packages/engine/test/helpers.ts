import type { CardDef, Effect, Faction, Tag } from '@delezh/cards';
import { resolveBattle, type SideContext } from '../src/battle.js';
import { DEFAULT_CONFIG, type MatchConfig } from '../src/config.js';
import type { RoundResult } from '../src/types.js';

let counter = 0;

/** Builds a throwaway card definition for effect tests. */
export function mk(overrides: Partial<CardDef> = {}): CardDef {
  counter++;
  return {
    id: overrides.id ?? `test-${counter}`,
    name: { ru: 'Тест', en: 'Test' },
    text: { ru: '', en: '' },
    power: 0,
    faction: 'neutral' as Faction,
    rarity: 'common',
    tags: [] as Tag[],
    weight: 1,
    maxCopies: 3,
    effects: [] as Effect[],
    ...overrides,
  };
}

export interface BattleFixture {
  a: CardDef[];
  b: CardDef[];
  hp?: [number, number];
  maxHp?: [number, number];
  /** Which side picked second in the row. */
  secondPicker?: 0 | 1 | null;
  config?: Partial<MatchConfig>;
}

/** Resolves a single row of cards without spinning up a whole match. */
export function battle(fixture: BattleFixture): RoundResult {
  const hp = fixture.hp ?? [20, 20];
  const maxHp = fixture.maxHp ?? [hp[0], hp[1]];
  const sides: [SideContext, SideContext] = [
    { cards: fixture.a, hp: hp[0], pickedSecond: fixture.secondPicker === 0 },
    { cards: fixture.b, hp: hp[1], pickedSecond: fixture.secondPicker === 1 },
  ];
  return resolveBattle(
    {
      round: 0,
      sides,
      instances: [
        fixture.a.map((c, i) => ({ uid: `a${i}`, cardId: c.id, row: 0, slot: i })),
        fixture.b.map((c, i) => ({ uid: `b${i}`, cardId: c.id, row: 0, slot: i })),
      ],
      config: { ...DEFAULT_CONFIG, ...fixture.config },
    },
    maxHp,
  );
}
