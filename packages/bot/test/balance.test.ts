import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '@delezh/cards';
import { isCrossRow, simulate } from '../src/simulate.js';

/**
 * Balance regression. Runs a smaller sample than the tuning script (`pnpm sim
 * --matches 3000`) with fixed seeds, so it is deterministic and fast enough for
 * CI while still catching a card that has drifted out of the corridor.
 *
 * The corridor is applied per card to whichever rate actually measures it — see
 * the comment on CROSS_ROW_KINDS in simulate.ts.
 */
describe('balance', () => {
  const result = simulate({ matches: 800, seed: 'regression', levels: ['hard', 'hard'], cards: ALL_CARDS, mirrored: true });

  it('keeps the first picker inside 46-54%', () => {
    expect(result.firstPickerWinRate).toBeGreaterThan(0.46);
    expect(result.firstPickerWinRate).toBeLessThan(0.54);
  });

  it('keeps every card inside the 42-58% corridor', () => {
    const offenders = result.outOfBand.map((c) => `${c.id} ${(c.metric * 100).toFixed(1)}% (${c.metricName})`);
    expect(offenders).toEqual([]);
  });

  it('samples every card often enough for the corridor to mean something', () => {
    for (const card of ALL_CARDS) {
      const stats = result.cards.find((c) => c.id === card.id);
      expect(stats, card.id).toBeDefined();
      expect(stats!.rowsDecided, `${card.id} was barely drafted`).toBeGreaterThan(100);
    }
  });

  it('still resolves most matches on points rather than by knockout', () => {
    // Rows played would collapse toward 1 if damage were ever runaway.
    expect(result.avgRounds).toBeGreaterThan(4.7);
    expect(result.avgRounds).toBeLessThanOrEqual(5);
    expect(result.drawRate).toBeLessThan(0.05);
  });

  it('classifies cards by where their payoff lands', () => {
    const cross = ALL_CARDS.filter(isCrossRow).map((c) => c.id).sort();
    expect(cross).toEqual(
      ['apex-beast', 'bulwark', 'cinder-priest', 'herald', 'oracle-coin', 'quickstep', 'seer', 'void-titan', 'warlord'].sort(),
    );
  });
});
