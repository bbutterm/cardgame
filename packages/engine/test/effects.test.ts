import { describe, expect, it } from 'vitest';
import { battle, mk } from './helpers.js';

/** Effects resolved at battle time. The list lives in covered.ts. */

describe('powerIf', () => {
  it('adds power when the condition holds', () => {
    const leader = mk({
      power: 2,
      faction: 'beast',
      effects: [{ kind: 'powerIf', amount: 2, cond: { type: 'count', counter: { scope: 'self', faction: 'beast', excludeSelf: true } } }],
    });
    const wolf = mk({ power: 2, faction: 'beast' });

    expect(battle({ a: [leader], b: [] }).raw[0]).toBe(2);
    expect(battle({ a: [leader, wolf], b: [] }).raw[0]).toBe(6);
  });

  it('respects the min threshold', () => {
    const tamer = mk({
      power: 2,
      effects: [
        { kind: 'powerIf', amount: 4, cond: { type: 'count', counter: { scope: 'self', faction: 'beast', excludeSelf: true }, min: 2 } },
      ],
    });
    const beast = mk({ power: 1, faction: 'beast' });

    expect(battle({ a: [tamer, beast], b: [] }).raw[0]).toBe(3);
    expect(battle({ a: [tamer, beast, beast], b: [] }).raw[0]).toBe(8);
  });

  it('supports pickedSecond, hpAtMost and behind conditions', () => {
    const second = mk({ power: 2, effects: [{ kind: 'powerIf', amount: 4, cond: { type: 'pickedSecond' } }] });
    expect(battle({ a: [second], b: [], secondPicker: 0 }).raw[0]).toBe(6);
    expect(battle({ a: [second], b: [], secondPicker: 1 }).raw[0]).toBe(2);

    const desperate = mk({ power: 1, effects: [{ kind: 'powerIf', amount: 5, cond: { type: 'hpAtMost', value: 6 } }] });
    expect(battle({ a: [desperate], b: [], hp: [6, 20] }).raw[0]).toBe(6);
    expect(battle({ a: [desperate], b: [], hp: [7, 20] }).raw[0]).toBe(1);

    const underdog = mk({ power: 1, effects: [{ kind: 'powerIf', amount: 3, cond: { type: 'behind' } }] });
    expect(battle({ a: [underdog], b: [], hp: [5, 9] }).raw[0]).toBe(4);
    expect(battle({ a: [underdog], b: [], hp: [9, 5] }).raw[0]).toBe(1);
  });

  it('can read the opponent side', () => {
    const spy = mk({
      power: 1,
      effects: [{ kind: 'powerIf', amount: 3, cond: { type: 'count', counter: { scope: 'opponent', faction: 'fire' } } }],
    });
    const fire = mk({ power: 1, faction: 'fire' });
    expect(battle({ a: [spy], b: [fire] }).raw[0]).toBe(4);
    expect(battle({ a: [spy], b: [] }).raw[0]).toBe(1);
  });
});

describe('powerPer', () => {
  it('scales with the number of matching cards', () => {
    const wildfire = mk({
      power: 1,
      faction: 'fire',
      effects: [{ kind: 'powerPer', amount: 1, counter: { scope: 'self', faction: 'fire' } }],
    });
    const fire = mk({ power: 1, faction: 'fire' });

    // Counts itself: 1 base + 1.
    expect(battle({ a: [wildfire], b: [] }).raw[0]).toBe(2);
    expect(battle({ a: [wildfire, fire], b: [] }).raw[0]).toBe(4);
    expect(battle({ a: [wildfire, fire, fire], b: [] }).raw[0]).toBe(6);
  });

  it('honours excludeSelf', () => {
    const broker = mk({
      power: 2,
      faction: 'shadow',
      effects: [{ kind: 'powerPer', amount: 2, counter: { scope: 'self', faction: 'shadow', excludeSelf: true } }],
    });
    expect(battle({ a: [broker], b: [] }).raw[0]).toBe(2);
    expect(battle({ a: [broker, mk({ power: 0, faction: 'shadow' })], b: [] }).raw[0]).toBe(4);
  });

  it('counts by tag', () => {
    const rat = mk({
      power: 1,
      tags: ['swarm'],
      effects: [{ kind: 'powerPer', amount: 2, counter: { scope: 'self', tag: 'swarm', excludeSelf: true } }],
    });
    const swarm = mk({ power: 0, tags: ['swarm'] });
    const notSwarm = mk({ power: 0 });
    expect(battle({ a: [rat, swarm, notSwarm], b: [] }).raw[0]).toBe(3);
  });
});

describe('weaken', () => {
  it('reduces the opponent row power and flips a close round', () => {
    const nightmare = mk({ power: 3, effects: [{ kind: 'weaken', amount: 2 }] });
    const brute = mk({ power: 4 });

    const result = battle({ a: [nightmare], b: [brute] });
    expect(result.raw).toEqual([3, 4]);
    expect(result.power).toEqual([3, 2]);
    expect(result.winner).toBe(0);
    expect(result.hpAfter).toEqual([20, 19]);
  });

  it('never pushes a side below zero power', () => {
    const crusher = mk({ power: 0, effects: [{ kind: 'weaken', amount: 9 }] });
    expect(battle({ a: [crusher], b: [mk({ power: 2 })] }).power[1]).toBe(0);
  });
});

describe('shield', () => {
  it('absorbs combat damage only for its owner', () => {
    const bulwark = mk({ power: 2, effects: [{ kind: 'shield', amount: 3 }] });
    const giant = mk({ power: 7 });

    const result = battle({ a: [bulwark], b: [giant] });
    expect(result.winner).toBe(1);
    // 5 damage - 3 shield.
    expect(result.hpDelta[0]).toBe(-2);
  });

  it('cannot turn damage into healing', () => {
    const bulwark = mk({ power: 2, effects: [{ kind: 'shield', amount: 9 }] });
    expect(battle({ a: [bulwark], b: [mk({ power: 3 })] }).hpDelta[0]).toBe(0);
  });
});

describe('heal', () => {
  it('restores hp up to the cap', () => {
    const medic = mk({ power: 1, effects: [{ kind: 'heal', amount: 3 }] });
    expect(battle({ a: [medic], b: [mk({ power: 1 })], hp: [10, 20], maxHp: [20, 20] }).hpAfter[0]).toBe(13);
    expect(battle({ a: [medic], b: [mk({ power: 1 })], hp: [19, 20], maxHp: [20, 20] }).hpAfter[0]).toBe(20);
  });
});

describe('burn', () => {
  it('damages the opponent regardless of who wins the row', () => {
    const priest = mk({ power: 1, effects: [{ kind: 'burn', amount: 2 }] });
    const brute = mk({ power: 5 });

    const result = battle({ a: [priest], b: [brute] });
    expect(result.winner).toBe(1);
    expect(result.hpDelta[1]).toBe(-2);
    expect(result.hpDelta[0]).toBe(-4);
  });

  it('ignores shields', () => {
    const priest = mk({ power: 3, effects: [{ kind: 'burn', amount: 2 }] });
    const turtle = mk({ power: 3, effects: [{ kind: 'shield', amount: 5 }] });
    expect(battle({ a: [priest], b: [turtle] }).hpDelta[1]).toBe(-2);
  });
});

describe('mirrorStrongest', () => {
  it('copies the strongest other base power on its own side', () => {
    const idol = mk({ power: 0, effects: [{ kind: 'mirrorStrongest' }] });
    expect(battle({ a: [idol], b: [] }).raw[0]).toBe(0);
    expect(battle({ a: [idol, mk({ power: 5 })], b: [] }).raw[0]).toBe(5 + 5);
  });

  it('does not copy from the opponent', () => {
    const idol = mk({ power: 0, effects: [{ kind: 'mirrorStrongest' }] });
    expect(battle({ a: [idol], b: [mk({ power: 8 })] }).raw[0]).toBe(0);
  });

  it('is order independent when two idols meet', () => {
    const idol = mk({ id: 'idol-a', power: 0, effects: [{ kind: 'mirrorStrongest' }] });
    const idol2 = mk({ id: 'idol-b', power: 0, effects: [{ kind: 'mirrorStrongest' }] });
    const big = mk({ power: 4 });
    expect(battle({ a: [idol, idol2, big], b: [] }).raw[0]).toBe(12);
    expect(battle({ a: [big, idol2, idol], b: [] }).raw[0]).toBe(12);
  });
});

describe('lonerBonus', () => {
  it('rewards a smaller side', () => {
    const loner = mk({ power: 1, effects: [{ kind: 'lonerBonus', amount: 5 }] });
    const filler = mk({ power: 0 });
    expect(battle({ a: [loner], b: [] }).raw[0]).toBe(1 + 4);
    expect(battle({ a: [loner, filler], b: [] }).raw[0]).toBe(1 + 3);
    expect(battle({ a: [loner, filler, filler], b: [] }).raw[0]).toBe(1 + 2);
  });

  it('clamps a card at zero rather than negative power', () => {
    const loner = mk({ power: 1, effects: [{ kind: 'lonerBonus', amount: 0 }] });
    const filler = mk({ power: 0 });
    expect(battle({ a: [loner, filler, filler], b: [] }).raw[0]).toBe(0);
  });
});

describe('damage rules', () => {
  it('deals the power difference to the loser', () => {
    const result = battle({ a: [mk({ power: 9 })], b: [mk({ power: 3 })] });
    expect(result.hpAfter).toEqual([20, 14]);
  });

  it('deals nothing on a tie', () => {
    const result = battle({ a: [mk({ power: 4 })], b: [mk({ power: 4 })] });
    expect(result.winner).toBeNull();
    expect(result.hpAfter).toEqual([20, 20]);
  });

  it('respects maxRoundDamage when configured', () => {
    const result = battle({ a: [mk({ power: 20 })], b: [mk({ power: 0 })], config: { maxRoundDamage: 5 } });
    expect(result.hpDelta[1]).toBe(-5);
  });

  it('never drops hp below zero', () => {
    const result = battle({ a: [mk({ power: 30 })], b: [mk({ power: 0 })], hp: [20, 4] });
    expect(result.hpAfter[1]).toBe(0);
  });
});
