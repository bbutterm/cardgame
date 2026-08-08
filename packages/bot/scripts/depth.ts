/**
 * How much room does a rule leave for playing well?
 *
 * The probe is deliberately blunt: a **greedy** player who always takes the
 * biggest printed number, against the `hard` bot, on a pool of nothing but
 * vanilla cards. Vanilla only, because the question is what the *rule* is worth
 * — with synergies in the pool the cards answer for it.
 *
 * Under the shipped `sum` rule greedy is not a heuristic, it is the optimal
 * strategy, and the result says so: it holds its own. A rule worth having is one
 * where greedy loses, because that is the same thing as saying there is
 * something to be better at.
 *
 *   npx tsx packages/bot/scripts/depth.ts [--matches 2000]
 */
import { CARDS, getCard, type CardDef } from '@delezh/cards';
import {
  applyAction,
  createMatch,
  createRng,
  isOver,
  legalPicks,
  withConfig,
  type MatchConfig,
  type MatchState,
  type PlayerIndex,
} from '@delezh/engine';
import { chooseCard } from '../src/index.js';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

const MATCHES = Number(arg('matches', '2000'));
const VANILLA = CARDS.filter((c) => c.effects.length === 0);
/** `--pool full` measures the same rules against the real 30-card set. */
const POOL = arg('pool', 'vanilla') === 'full' ? CARDS : VANILLA;

/** Always the biggest printed number; ties go to the earliest slot. */
function greedyUid(state: MatchState, player: PlayerIndex): string {
  const picks = legalPicks(state, player);
  let best = picks[0]!;
  for (const p of picks) {
    if (getCard(p.cardId).power > getCard(best.cardId).power) best = p;
  }
  return best.uid;
}

interface Outcome {
  greedyWinRate: number;
  draws: number;
  avgRows: number;
  bustRate: number;
}

/**
 * Fairness check, run separately: two `hard` bots, mirrored seeds, how often
 * does the seat that picks first in row 1 win? A rule that creates depth by
 * handing the match to one seat has not created anything.
 */
function seatFairness(config: Partial<MatchConfig>, cards: readonly CardDef[]): number {
  const rng = createRng('depth-fair');
  let firstWins = 0;
  let decisive = 0;
  for (let i = 0; i < MATCHES; i++) {
    const firstPicker = (i % 2) as 0 | 1;
    let { state } = createMatch({ seed: `fair#${Math.floor(i / 2)}`, firstPicker, cards, config });
    let guard = 0;
    while (!isOver(state) && guard++ < 200) {
      const player = state.turn;
      state = applyAction(state, player, {
        type: 'pick',
        uid: chooseCard(state, player, { level: 'hard', random: rng.next }),
      }).state;
    }
    if (state.winner === null) continue;
    decisive++;
    if (state.winner === firstPicker) firstWins++;
  }
  return firstWins / decisive;
}

/** Seat 0 is greedy, seat 1 is the `hard` bot. Seeds are mirrored. */
function run(config: Partial<MatchConfig>, cards: readonly CardDef[]): Outcome {
  const rng = createRng('depth');
  const full = withConfig(config);
  let greedyWins = 0;
  let draws = 0;
  let rows = 0;
  let busts = 0;
  let sides = 0;

  for (let i = 0; i < MATCHES; i++) {
    let { state } = createMatch({
      seed: `depth#${Math.floor(i / 2)}`,
      firstPicker: (i % 2) as 0 | 1,
      cards,
      config,
    });

    // `lastRound` is the only record a state keeps of a resolved row, so the
    // rows have to be collected as they happen rather than read off the end.
    let guard = 0;
    // -1, not 0: `lastRound.round` is zero-based, so starting at 0 silently
    // skips the first row of every match.
    let seenRounds = -1;
    while (!isOver(state) && guard++ < 200) {
      const player = state.turn;
      const uid =
        player === 0 ? greedyUid(state, player) : chooseCard(state, player, { level: 'hard', random: rng.next });
      state = applyAction(state, player, { type: 'pick', uid }).state;
      if (state.lastRound && state.lastRound.round !== seenRounds) {
        seenRounds = state.lastRound.round;
        rows++;
        if (full.rowRule === 'closest') {
          for (const p of state.lastRound.power) {
            sides++;
            if (p > full.rowTarget) busts++;
          }
        }
      }
    }
    if (state.winner === 0) greedyWins++;
    else if (state.winner === null) draws++;
  }

  const decisive = MATCHES - draws;
  return {
    greedyWinRate: greedyWins / decisive,
    draws: draws / MATCHES,
    avgRows: rows / MATCHES,
    bustRate: sides ? busts / sides : 0,
  };
}

const TARGETS = (arg('targets', '7,8,9,10,11,12').split(',').filter(Boolean).map(Number));

const ARMS: Array<{ label: string; config: Partial<MatchConfig> }> = [
  { label: 'sum (shipped)', config: { rowRule: 'sum' } },
  { label: 'lanes', config: { rowRule: 'lanes' } },
  ...TARGETS.map((rowTarget) => ({
    label: `closest to ${rowTarget}`,
    config: { rowRule: 'closest' as const, rowTarget },
  })),
];

console.log(`\n=== greedy "take the biggest number" vs hard bot ===`);
console.log(`${MATCHES} matches per arm, ${POOL.length} cards, mirrored seeds\n`);
console.log('rule                   greedy%   1st seat%   draws   rows   bust%');
console.log('-'.repeat(70));

for (const arm of ARMS) {
  const r = run(arm.config, POOL);
  const seat = seatFairness(arm.config, POOL);
  // Two ways to fail: greedy still works (no depth), or one seat wins by
  // sitting there (depth bought with unfairness).
  const flags = [
    r.greedyWinRate > 0.45 ? 'greedy is fine' : '',
    seat < 0.46 || seat > 0.54 ? 'seat unfair' : '',
  ].filter(Boolean);
  console.log(
    `${arm.label.padEnd(21)} ${(r.greedyWinRate * 100).toFixed(1).padStart(6)}%  ${(seat * 100)
      .toFixed(1)
      .padStart(8)}%   ${(r.draws * 100).toFixed(1).padStart(5)}%  ${r.avgRows.toFixed(2).padStart(5)}  ${(
      r.bustRate * 100
    )
      .toFixed(1)
      .padStart(5)}%${flags.length ? '   <- ' + flags.join(', ') : ''}`,
  );
}
console.log('');
