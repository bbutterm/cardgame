import { describe, expect, it } from 'vitest';
import { getCard } from '@delezh/cards';
import { resolveBattle, type SideContext } from '../src/battle.js';
import { withConfig } from '../src/config.js';
import type { CardInstance } from '../src/types.js';

/**
 * Alternative row rules, off by default. `sum` is what the 30 cards are
 * balanced against; these two are candidates measured by
 * `packages/bot/scripts/depth.ts` and are not in play unless a config says so.
 */
describe('row rules', () => {
  const sides = (mine: string[], theirs: string[]) => ({
    round: 0,
    sides: [
      { cards: mine.map(getCard), hp: 11, pickedSecond: false },
      { cards: theirs.map(getCard), hp: 11, pickedSecond: true },
    ] as [SideContext, SideContext],
    instances: [
      mine.map((cardId, i) => ({ uid: `a${i}`, cardId, row: 0, slot: i })),
      theirs.map((cardId, i) => ({ uid: `b${i}`, cardId, row: 0, slot: i })),
    ] as [CardInstance[], CardInstance[]],
  });

  it('sum: the bigger total takes the row', () => {
    const input = { ...sides(['colossus', 'ember'], ['wanderer']), config: withConfig({ rowRule: 'sum' }) };
    const result = resolveBattle(input, [11, 11]);
    // 4 + 1 against 3.
    expect(result.winner).toBe(0);
    expect(result.hpAfter[1]).toBe(9);
  });

  it('closest: going over the target scores nothing at all', () => {
    // 4 + 4 = 8 is over a target of 7 and loses to a lone 3, which is exactly
    // the point of the rule — the bigger pile is the losing pile.
    const input = {
      ...sides(['colossus', 'siege-core'], ['wanderer']),
      config: withConfig({ rowRule: 'closest', rowTarget: 7 }),
    };
    const result = resolveBattle(input, [11, 11]);
    expect(result.winner).toBe(1);
  });

  it('closest: at or under the target it is still the bigger total', () => {
    const input = {
      ...sides(['colossus', 'ember'], ['wanderer']),
      config: withConfig({ rowRule: 'closest', rowTarget: 7 }),
    };
    expect(resolveBattle(input, [11, 11]).winner).toBe(0);
  });

  it('lanes: position against position, not pile against pile', () => {
    // Totals are 5 against 6, so `sum` gives this row to the second side. By
    // position it is 4>3 and 1>3 lost and 0>nothing won: 2-1 the other way.
    const input = {
      ...sides(['colossus', 'ember', 'quickstep'], ['wanderer', 'iron-drone']),
      config: withConfig({ rowRule: 'lanes' }),
    };
    const byLanes = resolveBattle(input, [11, 11]);
    const bySum = resolveBattle({ ...input, config: withConfig({ rowRule: 'sum' }) }, [11, 11]);
    expect(bySum.winner).toBe(1);
    expect(byLanes.winner).toBe(0);
  });

  it('lanes: the unopposed card of the three-card seat takes its position', () => {
    const input = {
      ...sides(['ember', 'ember', 'ember'], ['ember', 'ember']),
      config: withConfig({ rowRule: 'lanes' }),
    };
    // Two draws and one unopposed card: a 1-0 win rather than a tie.
    expect(resolveBattle(input, [11, 11]).winner).toBe(0);
  });
});
