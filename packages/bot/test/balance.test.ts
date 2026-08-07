import { describe, expect, it } from 'vitest';
import { ALL_CARDS, CARDS, EXPERIMENTAL_CARDS } from '@delezh/cards';
import { isCrossRow, simulate } from '../src/simulate.js';

/**
 * Balance regression. Runs a smaller sample than the tuning script (`pnpm sim
 * --matches 5000`) with fixed seeds, so it is deterministic and fast enough for
 * CI while still catching a card that has drifted out of the corridor.
 *
 * The corridor is applied per card to whichever rate actually measures it — see
 * the comment on CROSS_ROW_KINDS in simulate.ts.
 */

const MATCHES = 800;

/** The pool a real match is dealt from: `createMatch` defaults to CARDS. */
const shipping = simulate({
  matches: MATCHES,
  seed: 'regression',
  cards: CARDS,
  levels: ['hard', 'hard'],
  mirrored: true,
});

/** Base plus the accepted experiments, which are opt-in content. */
const withExperiments = simulate({
  matches: MATCHES,
  seed: 'regression-exp',
  cards: ALL_CARDS,
  levels: ['hard', 'hard'],
  mirrored: true,
});

describe('shipping pool', () => {
  it('keeps the first picker inside 46-54%', () => {
    expect(shipping.firstPickerWinRate).toBeGreaterThan(0.46);
    expect(shipping.firstPickerWinRate).toBeLessThan(0.54);
  });

  it('keeps every card inside the 42-58% corridor', () => {
    const offenders = shipping.outOfBand.map((c) => `${c.id} ${(c.metric * 100).toFixed(1)}% (${c.metricName})`);
    expect(offenders).toEqual([]);
  });

  it('samples every card often enough for the corridor to mean something', () => {
    for (const card of CARDS) {
      const stats = shipping.cards.find((c) => c.id === card.id);
      expect(stats, card.id).toBeDefined();
      expect(stats!.rowsDecided, `${card.id} was barely drafted`).toBeGreaterThan(100);
    }
  });

  it('still resolves most matches on points rather than by knockout', () => {
    // Rows played would collapse toward 1 if damage were ever runaway.
    expect(shipping.avgRounds).toBeGreaterThan(4.7);
    expect(shipping.avgRounds).toBeLessThanOrEqual(5);
    expect(shipping.drawRate).toBeLessThan(0.05);
  });
});

describe('experimental pool', () => {
  it('keeps every accepted experiment inside the corridor', () => {
    const ids = new Set(EXPERIMENTAL_CARDS.map((c) => c.id));
    const offenders = withExperiments.outOfBand
      .filter((c) => ids.has(c.id))
      .map((c) => `${c.id} ${(c.metric * 100).toFixed(1)}% (${c.metricName})`);
    expect(offenders).toEqual([]);
  });

  /**
   * Individually-fair cards can still make the *match* unfair as a set. Adding
   * the experiments moves the first picker from ~49.8% to ~52.5% at volume,
   * because most of them reward the three-card seat. That is why they are
   * opt-in rather than dealt by default, and this is what would notice a future
   * experiment making the drift worse.
   */
  it('does not push the first picker past 55%', () => {
    expect(withExperiments.firstPickerWinRate).toBeLessThan(0.55);
  });
});

describe('metric classification', () => {
  it('classifies cards by where their payoff lands', () => {
    const CROSS_ROW_KINDS = ['skipNextPick', 'extraPick', 'firstPickerSelf', 'revealNextRow', 'burn', 'heal', 'shield'];
    for (const card of ALL_CARDS) {
      const hasCrossRowEffect = card.effects.some((e) => CROSS_ROW_KINDS.includes(e.kind));
      expect(isCrossRow(card), card.id).toBe(hasCrossRowEffect);
    }
    // Both buckets must be non-empty or the split is not doing any work.
    expect(ALL_CARDS.filter(isCrossRow).length).toBeGreaterThan(3);
    expect(ALL_CARDS.filter((c) => !isCrossRow(c)).length).toBeGreaterThan(3);
  });
});
