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

/**
 * 2400, not the 800 this used with the old rule.
 *
 * `closest` made the corridor noisier: a bust takes a whole row to zero, so a
 * card's measured rate swings further per match. Measured across three
 * independent seeds, cards falsely outside the corridor:
 *
 *   800 matches -> 3, 0, 0      1600 -> 1, 0, 0      2400 -> 0, 0, 0
 *
 * At 800 this suite failed on a card set that a 2500-match run put comfortably
 * in band. A guard that flickers is worse than a slow one — it trains you to
 * re-run the suite instead of reading it.
 */
const MATCHES = 2400;

/** The pool a real match is dealt from: `createMatch` defaults to CARDS. */
const shipping = simulate({
  matches: MATCHES,
  seed: 'regression',
  cards: CARDS,
  levels: ['hard', 'hard'],
  mirrored: true,
});

/**
 * Base plus the accepted experiments, which are opt-in content.
 *
 * Half the sample of the shipping arm on purpose: every assertion against it is
 * deliberately loose (the corridor for six cards, and a runaway bound), so
 * paying full price for a precision none of them use is just a slower suite.
 */
const withExperiments = simulate({
  matches: MATCHES / 2,
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
   * Individually-fair cards can still make the *match* unfair as a set. At 4000
   * matches the base 30 put the first picker on 49.5% and all 36 on 53.5–54.3%,
   * depending on the seed set — at the edge of the corridor the base set is held
   * to, which is exactly why the experiments are opt-in, offline and unranked
   * rather than dealt by default.
   *
   * The bound here is loose on purpose. This arm resolves a win rate to about
   * ±2 points, so a 54% assertion at this sample size would fail on seed choice
   * alone; the tight number is measured with `pnpm balance --grid pool`. What
   * this catches is a future experiment that makes the drift *run away*, which
   * is the failure worth having in CI.
   */
  it('does not let the first picker run away', () => {
    expect(withExperiments.firstPickerWinRate).toBeLessThan(0.58);
  });

  /**
   * Ships exactly the experiments EXPERIMENTS.md says were accepted.
   *
   * Salvager was rejected there as a duplicate decision and stayed in the array
   * anyway — invisible while the set was dev-only, and shipped to players the
   * moment finishing the campaign started unlocking it. The doc is the record of
   * the verdict, so it is what the code is checked against.
   */
  it('matches the verdict recorded in EXPERIMENTS.md', async () => {
    const { readFile } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const here = dirname(fileURLToPath(import.meta.url));
    const doc = await readFile(join(here, '..', '..', '..', 'EXPERIMENTS.md'), 'utf8');
    const accepted = doc.match(/^## Accepted — (\d+) of (\d+) tried$/m);
    const rejected = doc.match(/^## Rejected — (\d+)$/m);

    expect(accepted, 'EXPERIMENTS.md has no "## Accepted — N of M tried" header').not.toBeNull();
    expect(rejected, 'EXPERIMENTS.md has no "## Rejected — N" header').not.toBeNull();

    const kept = Number(accepted![1]);
    expect(EXPERIMENTAL_CARDS.length).toBe(kept);
    expect(kept + Number(rejected![1])).toBe(Number(accepted![2]));
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
