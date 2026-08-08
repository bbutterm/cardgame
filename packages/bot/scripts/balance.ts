/**
 * Config sweep. Runs the simulator across a grid of match configs and prints the
 * numbers that decide tuning: first-picker win rate, how often a match ends by
 * lethal rather than on points, and how wide the final HP gap is.
 *
 *   pnpm balance
 *   pnpm balance --matches 600 --grid hp
 */
import { ALL_CARDS, CARDS } from '@delezh/cards';
import type { FirstPickerRule, MatchConfig } from '@delezh/engine';
import { createRng } from '@delezh/engine';
import { playMatch } from '../src/simulate.js';
import type { BotLevel } from '../src/index.js';

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? fallback) : fallback;
}

const MATCHES = Number(arg('matches', '600'));
const GRID = arg('grid', 'hp');
const LEVELS = arg('levels', 'hard,hard').split(',') as [BotLevel, BotLevel];

interface Row {
  label: string;
  firstPickerWinRate: number;
  lethalRate: number;
  drawRate: number;
  avgRounds: number;
  avgMargin: number;
  avgLoserHp: number;
}

/** The experimental grid swaps the card pool rather than the match config. */
const POOLS: Record<string, readonly (typeof ALL_CARDS)[number][]> = {
  base: CARDS,
  all: ALL_CARDS,
};

function run(label: string, config: Partial<MatchConfig>, pool: readonly (typeof ALL_CARDS)[number][] = ALL_CARDS): Row {
  const rng = createRng(`balance-${label}`);
  let firstWins = 0;
  let decisive = 0;
  let draws = 0;
  let lethal = 0;
  let rounds = 0;
  let margin = 0;
  let loserHp = 0;

  for (let i = 0; i < MATCHES; i++) {
    const outcome = playMatch({
      seed: `balance#${Math.floor(i / 2)}`,
      levels: LEVELS,
      config,
      cards: pool,
      firstPicker: (i % 2) as 0 | 1,
      random: rng.next,
    });
    rounds += outcome.rounds;
    if (Math.min(outcome.hp[0], outcome.hp[1]) === 0) lethal++;
    if (outcome.winner === null) {
      draws++;
      continue;
    }
    decisive++;
    if (outcome.winner === outcome.firstPicker) firstWins++;
    const loser = outcome.winner === 0 ? 1 : 0;
    margin += outcome.hp[outcome.winner] - outcome.hp[loser];
    loserHp += outcome.hp[loser];
  }

  return {
    label,
    firstPickerWinRate: decisive > 0 ? firstWins / decisive : 0.5,
    lethalRate: lethal / MATCHES,
    drawRate: draws / MATCHES,
    avgRounds: rounds / MATCHES,
    avgMargin: decisive > 0 ? margin / decisive : 0,
    avgLoserHp: decisive > 0 ? loserHp / decisive : 0,
  };
}

const grids: Record<string, Array<{ label: string; config: Partial<MatchConfig> }>> = {
  hp: [8, 10, 12, 14, 16, 20].flatMap((startHp) =>
    [0, 1, 2].map((bonus) => ({
      label: `hp=${startHp} +${bonus}`,
      config: { startHp, secondPickerHpBonus: bonus },
    })),
  ),
  rule: (['alternate', 'loser', 'fixed'] as FirstPickerRule[]).flatMap((rule) =>
    [0, 1, 2, 3].map((bonus) => ({
      label: `${rule} +${bonus}`,
      config: { firstPickerRule: rule, secondPickerHpBonus: bonus },
    })),
  ),
  fine: [10, 11, 12, 13, 14].flatMap((startHp) =>
    [1, 2, 3].map((bonus) => ({
      label: `hp=${startHp} +${bonus}`,
      config: { startHp, secondPickerHpBonus: bonus },
    })),
  ),
  damage: [1, 1.5, 2].flatMap((damagePerPower) =>
    [0, 6, 8].map((cap) => ({
      label: `dmg=${damagePerPower} cap=${cap}`,
      config: { damagePerPower, maxRoundDamage: cap },
    })),
  ),
};

const grid = grids[GRID];
if (GRID === 'pool') {
  console.log(`\n=== card pools, ${MATCHES} matches each, ${LEVELS.join(' vs ')} ===\n`);
  console.log('pool              first%   lethal%  draw%   rows   margin  loserHp');
  console.log('-'.repeat(70));
  for (const [name, pool] of Object.entries(POOLS)) {
    const r = run(name, {}, pool);
    const flag = r.firstPickerWinRate >= 0.46 && r.firstPickerWinRate <= 0.54 ? '' : '  <<<';
    console.log(
      `${(name + ` (${pool.length})`).padEnd(17)} ${(r.firstPickerWinRate * 100).toFixed(1).padStart(5)}   ${(
        r.lethalRate * 100
      ).toFixed(1).padStart(6)}  ${(r.drawRate * 100).toFixed(1).padStart(5)}  ${r.avgRounds.toFixed(2).padStart(5)}  ${r.avgMargin
        .toFixed(1)
        .padStart(6)}  ${r.avgLoserHp.toFixed(1).padStart(6)}${flag}`,
    );
  }
  process.exit(0);
}
if (!grid) {
  // `pool` is handled above and is not in `grids`, so it has to be named here
  // or the error message advertises everything except the one that swaps decks.
  console.error(`unknown grid "${GRID}". available: ${Object.keys(grids).join(', ')}, pool`);
  process.exit(1);
}

console.log(`\n=== grid "${GRID}", ${MATCHES} matches each, ${LEVELS.join(' vs ')} ===\n`);
console.log('config            first%   lethal%  draw%   rows   margin  loserHp');
console.log('-'.repeat(70));

for (const entry of grid) {
  const row = run(entry.label, entry.config);
  const flag = row.firstPickerWinRate >= 0.46 && row.firstPickerWinRate <= 0.54 ? '' : '  <<<';
  console.log(
    `${row.label.padEnd(17)} ${(row.firstPickerWinRate * 100).toFixed(1).padStart(5)}   ${(row.lethalRate * 100)
      .toFixed(1)
      .padStart(6)}  ${(row.drawRate * 100).toFixed(1).padStart(5)}  ${row.avgRounds.toFixed(2).padStart(5)}  ${row.avgMargin
      .toFixed(1)
      .padStart(6)}  ${row.avgLoserHp.toFixed(1).padStart(6)}${flag}`,
  );
}
