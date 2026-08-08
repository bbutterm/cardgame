import { describe, expect, it } from 'vitest';
import { resolveBattle } from '../src/battle.js';
import { withConfig } from '../src/config.js';
import { battle, mk } from './helpers.js';

/**
 * The row rules, and the arithmetic that decides a row.
 *
 * Everything here is built from synthetic cards rather than real ones. These
 * tests pin the *rule*, and the balance pass moves card numbers freely — a test
 * that says "Warlord is 8" fails the day Warlord becomes a 7, for no reason
 * that has anything to do with what it is testing.
 */

describe('row rules', () => {
  it('sum: the bigger total takes the row', () => {
    const result = battle({
      a: [mk({ power: 5 })],
      b: [mk({ power: 3 })],
      config: { rowRule: 'sum', maxRoundDamage: 0 },
    });
    expect(result.winner).toBe(0);
    expect(result.hpAfter[1]).toBe(18);
  });

  it('sum: an enormous total still wins, because nothing caps it', () => {
    const result = battle({ a: [mk({ power: 30 })], b: [mk({ power: 3 })], config: { rowRule: 'sum' } });
    expect(result.winner).toBe(0);
  });

  it('closest: going over the target scores nothing at all', () => {
    // 12 against a target of 11 loses to a lone 1. This one line is the rule.
    const config = { rowRule: 'closest' as const, rowTarget: 11 };
    const result = battle({ a: [mk({ power: 12 })], b: [mk({ power: 1 })], config });
    expect(result.winner).toBe(1);
  });

  it('closest: at or under the target it is still the bigger total', () => {
    const config = { rowRule: 'closest' as const, rowTarget: 11 };
    expect(battle({ a: [mk({ power: 11 })], b: [mk({ power: 10 })], config }).winner).toBe(0);
    expect(battle({ a: [mk({ power: 4 })], b: [mk({ power: 9 })], config }).winner).toBe(1);
  });

  it('closest: both sides over is a draw, not a race to the bigger bust', () => {
    const config = { rowRule: 'closest' as const, rowTarget: 11 };
    const result = battle({ a: [mk({ power: 20 })], b: [mk({ power: 12 })], config });
    expect(result.winner).toBeNull();
  });

  it('lanes: position against position, not pile against pile', () => {
    // Totals are 5 against 6, so `sum` hands this row to the second side. By
    // position it is 4>3 won, 1<3 lost, and 0 unopposed won: 2-1 the other way.
    const fixture = {
      a: [mk({ power: 4 }), mk({ power: 1 }), mk({ power: 0 })],
      b: [mk({ power: 3 }), mk({ power: 3 })],
    };
    expect(battle({ ...fixture, config: { rowRule: 'sum' } }).winner).toBe(1);
    expect(battle({ ...fixture, config: { rowRule: 'lanes' } }).winner).toBe(0);
  });

  it('lanes: the unopposed card of the three-card seat takes its position', () => {
    const result = battle({
      a: [mk({ power: 2 }), mk({ power: 2 }), mk({ power: 2 })],
      b: [mk({ power: 2 }), mk({ power: 2 })],
      config: { rowRule: 'lanes' },
    });
    // Two ties and one unopposed card: a 1-0 win rather than a draw.
    expect(result.winner).toBe(0);
  });
});

describe('closest: weaken cannot rescue a bust', () => {
  const config = { rowRule: 'closest' as const, rowTarget: 11, maxRoundDamage: 0 };

  it('a side over the target scores nothing even after being weakened onto it', () => {
    // 12 is one over. Weakening it by 2 would land it on exactly 10 if weaken
    // came first — an attack that turns a bust into the best row on the table.
    const result = battle({
      a: [mk({ power: 12 })],
      b: [mk({ power: 5 }), mk({ power: 0, effects: [{ kind: 'weaken', amount: 2 }] })],
      config,
    });
    expect(result.raw[0]).toBe(12);
    expect(result.weaken[1]).toBe(2);
    expect(result.winner).toBe(1);
  });

  it('still subtracts weaken from a side that is under the target', () => {
    const result = battle({
      a: [mk({ power: 4 })],
      b: [mk({ power: 3 }), mk({ power: 0, effects: [{ kind: 'weaken', amount: 2 }] })],
      config,
    });
    // 4 weakened to 2 against 3: the weaken decides the row rather than being
    // ignored, which is the case the rescue guard must not break.
    expect(result.power[0]).toBe(2);
    expect(result.winner).toBe(1);
  });
});

describe('rowVerdict is what the battle screen is shown', () => {
  it('reports the bust, the effective totals and the capped damage', () => {
    const config = withConfig({ rowRule: 'closest', rowTarget: 11, maxRoundDamage: 5 });
    const result = resolveBattle(
      {
        round: 0,
        sides: [
          { cards: [mk({ power: 12 })], hp: 11, pickedSecond: false },
          { cards: [mk({ power: 8 })], hp: 11, pickedSecond: true },
        ],
        instances: [
          [{ uid: 'a0', cardId: 'x', row: 0, slot: 0 }],
          [{ uid: 'b0', cardId: 'y', row: 0, slot: 0 }],
        ],
        config,
      },
      [11, 11],
    );
    // 12 busts to 0 against 8, so the margin is 8 — capped to 5 on the HP bar.
    expect(result.winner).toBe(1);
    expect(result.hpAfter[0]).toBe(6);
  });
});
