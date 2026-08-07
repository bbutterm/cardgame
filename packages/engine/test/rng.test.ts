import { describe, expect, it } from 'vitest';
import { createRng, hashSeed, weightedPick } from '../src/rng.js';
import { eloDelta, expectedScore } from '../src/elo.js';

describe('rng', () => {
  it('is reproducible from a seed', () => {
    const a = createRng('seed');
    const b = createRng('seed');
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('differs across seeds', () => {
    expect(createRng('a').next()).not.toBe(createRng('b').next());
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
  });

  it('can resume from a saved state', () => {
    const a = createRng('seed');
    a.next();
    a.next();
    const resumed = createRng('seed', a.state());
    expect(resumed.next()).toBe(createRng('seed', a.state()).next());
  });

  it('stays inside bounds', () => {
    const rng = createRng('bounds');
    for (let i = 0; i < 5000; i++) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      const n = rng.int(7);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(7);
    }
  });

  it('shuffles without losing elements', () => {
    const rng = createRng('shuffle');
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = rng.shuffle([...items]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
  });

  it('honours weights', () => {
    const rng = createRng('weights');
    const items = ['heavy', 'light'];
    let heavy = 0;
    for (let i = 0; i < 4000; i++) {
      if (weightedPick(rng, items, (i2) => (i2 === 'heavy' ? 9 : 1)) === 'heavy') heavy++;
    }
    expect(heavy / 4000).toBeGreaterThan(0.85);
    expect(heavy / 4000).toBeLessThan(0.95);
  });
});

describe('elo', () => {
  it('gives even odds to equal ratings', () => {
    expect(expectedScore(1200, 1200)).toBeCloseTo(0.5);
  });

  it('rewards beating a stronger opponent more', () => {
    const upset = eloDelta({ rating: 1000, gamesPlayed: 50 }, { rating: 1400, gamesPlayed: 50 }, 'win');
    const expected = eloDelta({ rating: 1400, gamesPlayed: 50 }, { rating: 1000, gamesPlayed: 50 }, 'win');
    expect(upset).toBeGreaterThan(expected);
  });

  it('is zero-sum for equal ratings', () => {
    const win = eloDelta({ rating: 1200, gamesPlayed: 50 }, { rating: 1200, gamesPlayed: 50 }, 'win');
    const loss = eloDelta({ rating: 1200, gamesPlayed: 50 }, { rating: 1200, gamesPlayed: 50 }, 'loss');
    expect(win + loss).toBe(0);
  });

  it('never awards a non-positive win or a non-negative loss', () => {
    expect(eloDelta({ rating: 2400, gamesPlayed: 500 }, { rating: 100, gamesPlayed: 500 }, 'win')).toBeGreaterThan(0);
    expect(eloDelta({ rating: 100, gamesPlayed: 500 }, { rating: 2400, gamesPlayed: 500 }, 'loss')).toBeLessThan(0);
  });

  it('moves new accounts faster', () => {
    const fresh = eloDelta({ rating: 1000, gamesPlayed: 1 }, { rating: 1000, gamesPlayed: 1 }, 'win');
    const settled = eloDelta({ rating: 1000, gamesPlayed: 100 }, { rating: 1000, gamesPlayed: 100 }, 'win');
    expect(fresh).toBeGreaterThan(settled);
  });
});
