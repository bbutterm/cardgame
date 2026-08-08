/**
 * Judges a whole rule configuration against every target at once.
 *
 * `depth.ts` answers one question (is greedy still fine?). This answers the
 * question that actually decides whether a rule can ship, because a rule can
 * buy depth and pay for it somewhere else — in seat fairness, in match length,
 * or by turning every row into a knockout.
 *
 * The five targets:
 *
 *   ruleDepth   greedy vs hard on **vanilla only** — what the rule is worth
 *               with no cards to prop it up. `sum` scores 50.0% here, which is
 *               the whole reason this file exists.
 *   setDepth    greedy vs hard on the full set — what a player actually meets.
 *   seat        first-seat win rate, hard vs hard. 46-54%.
 *   ramp        hard vs normal. A number near 50% means levels are cosmetic.
 *   pacing      rows played and knockout rate. ~5 rows, 10-25% knockouts.
 *
 *   npx tsx packages/bot/scripts/rules.ts [--matches 1500] [--arms sweep|final]
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
import { chooseCard, type BotLevel } from '../src/index.js';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

const MATCHES = Number(arg('matches', '1500'));
const VANILLA = CARDS.filter((c) => c.effects.length === 0);

type Picker = (state: MatchState, player: PlayerIndex) => string;

/** Always the biggest printed number; ties go to the earliest slot. */
const greedy: Picker = (state, player) => {
  const picks = legalPicks(state, player);
  let best = picks[0]!;
  for (const p of picks) if (getCard(p.cardId).power > getCard(best.cardId).power) best = p;
  return best.uid;
};

const bot = (level: BotLevel, random: () => number): Picker => (state, player) =>
  chooseCard(state, player, { level, random });

interface Tally {
  /** Win rate of seat 0, draws excluded. */
  seat0: number;
  /** Win rate of whoever picked first in row 1. */
  firstSeat: number;
  draws: number;
  rows: number;
  koRate: number;
  bustRate: number;
}

function play(
  config: Partial<MatchConfig>,
  cards: readonly CardDef[],
  pickers: [Picker, Picker],
  seedTag: string,
): Tally {
  const full = withConfig(config);
  let seat0Wins = 0;
  let firstWins = 0;
  let draws = 0;
  let rows = 0;
  let kos = 0;
  let busts = 0;
  let sides = 0;

  for (let i = 0; i < MATCHES; i++) {
    // Mirrored: the same deal is played from both seats, so the deal cannot
    // favour either picker across the sample.
    const firstPicker = (i % 2) as 0 | 1;
    let { state } = createMatch({ seed: `${seedTag}#${Math.floor(i / 2)}`, firstPicker, cards, config });

    let guard = 0;
    let seen = -1;
    while (!isOver(state) && guard++ < 200) {
      const player = state.turn;
      state = applyAction(state, player, { type: 'pick', uid: pickers[player](state, player) }).state;
      if (state.lastRound && state.lastRound.round !== seen) {
        seen = state.lastRound.round;
        rows++;
        for (const p of state.lastRound.power) {
          sides++;
          if (full.rowRule === 'closest' && p > full.rowTarget) busts++;
        }
      }
    }

    if (Math.min(state.players[0].hp, state.players[1].hp) === 0) kos++;
    if (state.winner === null) draws++;
    else {
      if (state.winner === 0) seat0Wins++;
      if (state.winner === firstPicker) firstWins++;
    }
  }

  const decisive = MATCHES - draws;
  return {
    seat0: seat0Wins / decisive,
    firstSeat: firstWins / decisive,
    draws: draws / MATCHES,
    rows: rows / MATCHES,
    koRate: kos / MATCHES,
    bustRate: sides ? busts / sides : 0,
  };
}

export interface Verdict {
  label: string;
  ruleDepth: number;
  setDepth: number;
  seat: number;
  ramp: number;
  rows: number;
  ko: number;
  bust: number;
  failures: string[];
}

export function judge(label: string, config: Partial<MatchConfig>): Verdict {
  const rng = createRng(`rules-${label}`);
  const hard = bot('hard', rng.next);

  const ruleDepth = play(config, VANILLA, [greedy, hard], 'vd').seat0;
  const setRun = play(config, CARDS, [greedy, hard], 'sd');
  const fair = play(config, CARDS, [hard, hard], 'fair');
  const ramp = play(config, CARDS, [hard, bot('normal', rng.next)], 'ramp').seat0;

  const failures: string[] = [];
  // The rule has to carry weight on its own, not lean on the card set.
  if (ruleDepth > 0.35) failures.push(`rule shallow (${(ruleDepth * 100).toFixed(0)}%)`);
  if (fair.firstSeat < 0.46 || fair.firstSeat > 0.54) failures.push(`seat ${(fair.firstSeat * 100).toFixed(1)}%`);
  if (ramp < 0.6) failures.push(`ramp ${(ramp * 100).toFixed(0)}%`);
  if (fair.rows < 4.4) failures.push(`rows ${fair.rows.toFixed(2)}`);
  if (fair.koRate > 0.3) failures.push(`ko ${(fair.koRate * 100).toFixed(0)}%`);

  return {
    label,
    ruleDepth,
    setDepth: setRun.seat0,
    seat: fair.firstSeat,
    ramp,
    rows: fair.rows,
    ko: fair.koRate,
    bust: setRun.bustRate,
    failures,
  };
}

export function header(): void {
  console.log('config                        rule%   set%    seat%   ramp%   rows   ko%   bust%   verdict');
  console.log('-'.repeat(104));
}

export function report(v: Verdict): void {
  console.log(
    `${v.label.padEnd(28)} ${(v.ruleDepth * 100).toFixed(1).padStart(5)}  ${(v.setDepth * 100)
      .toFixed(1)
      .padStart(5)}  ${(v.seat * 100).toFixed(1).padStart(6)}  ${(v.ramp * 100).toFixed(1).padStart(6)}  ${v.rows
      .toFixed(2)
      .padStart(5)}  ${(v.ko * 100).toFixed(0).padStart(4)}  ${(v.bust * 100).toFixed(1).padStart(5)}   ${
      v.failures.length ? v.failures.join(', ') : 'OK'
    }`,
  );
}

if (process.argv[1]?.endsWith('rules.ts')) {
  const arms: Array<{ label: string; config: Partial<MatchConfig> }> = [
    // Explicit, not `{}`: an empty override inherits whatever the default is,
    // so the baseline row would silently become a copy of the current default.
    { label: 'sum (old default)', config: { rowRule: 'sum', maxRoundDamage: 0 } },
    ...[9, 10, 11].flatMap((rowTarget) =>
      [0, 5, 7].map((maxRoundDamage) => ({
        label: `closest ${rowTarget}, cap ${maxRoundDamage || '-'}`,
        config: { rowRule: 'closest' as const, rowTarget, maxRoundDamage },
      })),
    ),
    ...[1, 2, 3].map((damagePerPower) => ({
      label: `lanes, dmg x${damagePerPower}`,
      config: { rowRule: 'lanes' as const, damagePerPower },
    })),
  ];

  console.log(`\n=== rule sweep, ${MATCHES} matches per cell, mirrored seeds ===\n`);
  console.log('rule%  = greedy vs hard, vanilla only   (want <=35)');
  console.log('set%   = greedy vs hard, full 30 cards');
  console.log('seat%  = first seat, hard vs hard       (want 46-54)');
  console.log('ramp%  = hard vs normal                 (want >=60)\n');
  header();
  for (const arm of arms) report(judge(arm.label, arm.config));
  console.log('');
}
