import { describe, expect, it } from 'vitest';
import { CARDS } from '@delezh/cards';
import { applyAction, createMatch, createRng, legalPicks, other } from '@delezh/engine';
import { BOT_LEVELS, chooseCard, type BotLevel } from '../src/index.js';
import { playMatch, simulate } from '../src/simulate.js';

describe('bot', () => {
  it('always returns a legal pick', () => {
    for (const level of BOT_LEVELS) {
      const rng = createRng(`legal-${level}`);
      let { state } = createMatch({ seed: `legal-${level}`, firstPicker: 0 });
      let guard = 0;
      while (state.phase !== 'gameOver' && guard++ < 200) {
        const options = legalPicks(state, state.turn);
        const uid = chooseCard(state, state.turn, { level, random: rng.next });
        expect(options.map((o) => o.uid)).toContain(uid);
        state = applyAction(state, state.turn, { type: 'pick', uid }).state;
      }
      expect(state.phase).toBe('gameOver');
    }
  });

  it('is deterministic given the same random source', () => {
    const run = () =>
      playMatch({ seed: 'determinism', levels: ['hard', 'hard'], firstPicker: 0, random: createRng('r').next });
    const a = run();
    const b = run();
    expect(a.winner).toBe(b.winner);
    expect(a.hp).toEqual(b.hp);
    expect(a.final.players[0].taken).toEqual(b.final.players[0].taken);
  });

  it('takes the strongest card when the row is otherwise identical', () => {
    const { state } = createMatch({
      seed: 'greed',
      firstPicker: 0,
      rows: [['pyre-giant', 'ember', 'ember', 'ember', 'ember']],
    });
    // Ember appears more than once only because rows are supplied explicitly.
    for (const level of BOT_LEVELS) {
      const uid = chooseCard(state, 0, { level, random: () => 0.5 });
      expect(state.open.find((c) => c?.uid === uid)?.cardId).toBe('pyre-giant');
    }
  });

  it('prices in the tempo cost of a skip card', () => {
    // Warlord is 8 power but costs a whole pick; Colossus is 5 and free.
    // The easy bot only reads numbers, the stronger ones should decline.
    const { state } = createMatch({
      seed: 'tempo',
      firstPicker: 0,
      rows: [['warlord', 'colossus', 'wanderer', 'ember', 'cog']],
    });
    const easy = state.open.find((c) => c?.uid === chooseCard(state, 0, { level: 'easy', random: () => 0.5 }))?.cardId;
    const normal = state.open.find((c) => c?.uid === chooseCard(state, 0, { level: 'normal', random: () => 0.5 }))?.cardId;
    expect(easy).toBe('warlord');
    expect(normal).toBe('colossus');
  });

  it('beats a weaker bot more often than not', () => {
    const result = simulate({ matches: 200, seed: 'ladder', levels: ['hard', 'easy'], mirrored: true, cards: CARDS });
    // Measured as player 0 (hard) wins, independent of who picked first.
    let hardWins = 0;
    let decisive = 0;
    const rng = createRng('ladder-check');
    for (let i = 0; i < 200; i++) {
      const outcome = playMatch({
        seed: `ladder#${Math.floor(i / 2)}`,
        levels: ['hard', 'easy'],
        firstPicker: (i % 2) as 0 | 1,
        random: rng.next,
      });
      if (outcome.winner === null) continue;
      decisive++;
      if (outcome.winner === 0) hardWins++;
    }
    expect(result.matches).toBe(200);
    expect(hardWins / decisive).toBeGreaterThan(0.6);
  });
});

describe('bot-vs-bot integration', () => {
  it('plays a complete match at every level pairing', () => {
    for (const a of BOT_LEVELS) {
      for (const b of BOT_LEVELS) {
        const outcome = playMatch({
          seed: `pair-${a}-${b}`,
          levels: [a, b] as [BotLevel, BotLevel],
          firstPicker: 0,
          random: createRng(`pair-${a}-${b}`).next,
        });

        expect(outcome.final.phase).toBe('gameOver');
        expect(outcome.results.length).toBe(outcome.rounds);
        expect(outcome.picks).toBe(outcome.rounds * outcome.final.config.rowSize);

        // Every card dealt in a played row ended up on exactly one side.
        const dealt = outcome.final.rows.slice(0, outcome.rounds).flat().length;
        const taken = outcome.final.players[0].taken.length + outcome.final.players[1].taken.length;
        expect(taken).toBe(dealt);

        // HP never leaves its bounds and the winner is the healthier player.
        for (const player of [0, 1] as const) {
          expect(outcome.hp[player]).toBeGreaterThanOrEqual(0);
          expect(outcome.hp[player]).toBeLessThanOrEqual(outcome.final.players[player].maxHp);
        }
        if (outcome.winner !== null && outcome.hp[other(outcome.winner)] > 0) {
          expect(outcome.hp[outcome.winner]).toBeGreaterThan(outcome.hp[other(outcome.winner)]);
        }
      }
    }
  });

  /**
   * The 7-minute target and the 20s pick timer only both hold for realistic
   * play: 25 picks at the full 20s would be 8m20s. See PROGRESS.md decision
   * D-06 — the timer is a backstop against AFK, not the expected pace.
   */
  it('fits the seven minute target at a realistic pace', () => {
    const outcome = playMatch({ seed: 'budget', levels: ['hard', 'hard'], firstPicker: 0, random: createRng('b').next });
    const typicalPickMs = 6_000;
    const battleAnimationMs = 3_500;
    const typical = outcome.picks * typicalPickMs + outcome.rounds * battleAnimationMs;
    expect(typical).toBeLessThanOrEqual(7 * 60 * 1000);
    // And the AFK worst case still fits inside the server's room lifetime.
    expect(outcome.picks * outcome.final.config.pickTimeoutMs).toBeLessThanOrEqual(10 * 60 * 1000);
  });
});
