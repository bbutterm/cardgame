/**
 * Campaign difficulty report.
 *
 *   pnpm tsx packages/bot/scripts/campaign.ts
 *   pnpm tsx packages/bot/scripts/campaign.ts --matches 4000
 *   pnpm tsx packages/bot/scripts/campaign.ts --only forge,pyre --prio
 *
 * For every encounter it plays the human seat (seat 0) as a `hard` bot and then
 * as a `normal` bot, over the SAME seeds with the first pick mirrored, so the
 * two models are paired and the seat bias cancels. What it reports is the thing
 * a campaign actually has to get right: does the win rate go down, encounter by
 * encounter, for both a good player and an average one.
 *
 * It cannot reuse `simulate()` because an encounter can override starting HP,
 * which `playMatch` does not expose; the loop below is the same shape minus the
 * per-card corridor machinery, plus pick-priority and pool-variety counters.
 */
import { readFileSync } from 'node:fs';
import { CAMPAIGN, getCard, type Encounter } from '@delezh/cards';
import { applyAction, createMatch, createRng, type PlayerIndex } from '@delezh/engine';
import { chooseCard, type BotLevel } from '../src/index.js';
import { simulate } from '../src/simulate.js';

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
const flag = (name: string): boolean => process.argv.includes(`--${name}`);

const MATCHES = Number(arg('matches', '2000'));
const ONLY = (arg('only') ?? '').split(',').filter(Boolean);
const SHOW_PRIO = flag('prio');

interface Arm {
  matches: number;
  wins: number;
  losses: number;
  draws: number;
  rounds: number;
  knockouts: number;
  distinctSum: number;
  hpMargin: number;
  appearances: Map<string, number>;
  firstOut: Map<string, number>;
}

function emptyArm(): Arm {
  return {
    matches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    rounds: 0,
    knockouts: 0,
    distinctSum: 0,
    hpMargin: 0,
    appearances: new Map(),
    firstOut: new Map(),
  };
}

/** One encounter played `n` times with the human seat driven by `human`. */
function runArm(encounter: Encounter, human: BotLevel, n: number): Arm {
  const arm = emptyArm();
  const rng = createRng(`camp:${encounter.id}:${human}`);
  const pool = encounter.pool.map((id) => getCard(id));
  const levels: [BotLevel, BotLevel] = [human, encounter.difficulty];

  for (let i = 0; i < n; i++) {
    const seed = `camp:${encounter.id}#${Math.floor(i / 2)}`;
    const firstPicker = (i % 2) as PlayerIndex;
    let { state } = createMatch({
      seed,
      cards: pool,
      config: encounter.rounds ? { rounds: encounter.rounds } : undefined,
      firstPicker,
      hp: encounter.hp,
    });

    const distinct = new Set<string>();
    for (const row of state.rows) for (const c of row) distinct.add(c.cardId);
    for (const row of state.rows) {
      const seen = new Set<string>();
      for (const c of row) {
        if (seen.has(c.cardId)) continue;
        seen.add(c.cardId);
        arm.appearances.set(c.cardId, (arm.appearances.get(c.cardId) ?? 0) + 1);
      }
    }

    const seatCounter = new Map<number, number>();
    let guard = 0;
    while (state.phase !== 'gameOver' && guard++ < 500) {
      const player = state.turn;
      const round = state.round;
      const uid = chooseCard(state, player, { level: levels[player], random: rng.next });
      const instance = state.open.find((c) => c?.uid === uid);
      const seat = seatCounter.get(round) ?? 0;
      seatCounter.set(round, seat + 1);
      if (seat === 0 && instance) {
        arm.firstOut.set(instance.cardId, (arm.firstOut.get(instance.cardId) ?? 0) + 1);
      }
      state = applyAction(state, player, { type: 'pick', uid }).state;
    }

    arm.matches++;
    arm.rounds += state.round + 1;
    arm.distinctSum += distinct.size;
    arm.hpMargin += state.players[0].hp - state.players[1].hp;
    if (state.players[0].hp <= 0 || state.players[1].hp <= 0) arm.knockouts++;
    if (state.winner === 0) arm.wins++;
    else if (state.winner === 1) arm.losses++;
    else arm.draws++;
  }
  return arm;
}

const pct = (v: number): string => `${(v * 100).toFixed(1)}%`;

/** Card taken first out of its row most often, among cards seen ≥ 30 rows. */
function topPriority(arm: Arm): { id: string; prio: number } | null {
  let best: { id: string; prio: number } | null = null;
  for (const [id, seen] of arm.appearances) {
    if (seen < 30) continue;
    const prio = (arm.firstOut.get(id) ?? 0) / seen;
    if (!best || prio > best.prio) best = { id, prio };
  }
  return best;
}

// --probe file.json runs candidate encounters that are not in CAMPAIGN yet, so a
// pool can be measured before it is committed to the data file.
const PROBE = arg('probe');
const ENCOUNTERS: readonly Encounter[] = PROBE
  ? (JSON.parse(readFileSync(PROBE, 'utf8')) as Encounter[])
  : CAMPAIGN;

// --matrix answers the question the report cannot: for THIS pool, what would
// each of the three bot levels and each HP split actually produce? The bot level
// is the coarse lever and the numbers are not guessable from the pool.
if (flag('matrix')) {
  console.log(`\n=== difficulty matrix: ${MATCHES} matches per cell ===`);
  console.log('\nenc          bot      hardWR  normWR   rows   KO%');
  console.log('-'.repeat(52));
  for (const encounter of ENCOUNTERS) {
    if (ONLY.length && !ONLY.includes(encounter.id)) continue;
    for (const level of ['easy', 'normal', 'hard'] as BotLevel[]) {
      const probe: Encounter = { ...encounter, difficulty: level };
      const h = runArm(probe, 'hard', MATCHES);
      const n = runArm(probe, 'normal', MATCHES);
      console.log(
        `${encounter.id.padEnd(12)} ${level.padEnd(7)} ${pct(h.wins / h.matches).padStart(6)}  ` +
          `${pct(n.wins / n.matches).padStart(6)}  ${(h.rounds / h.matches).toFixed(2)}  ` +
          `${pct(h.knockouts / h.matches).padStart(5)}`,
      );
    }
  }
  process.exit(0);
}

const rows: string[] = [];
console.log(`\n=== campaign report: ${MATCHES} matches per arm, mirrored seeds ===`);
console.log('\nenc          diff    hardWR  normWR   rows   KO%   distinct  top pick');
console.log('-'.repeat(78));

const summary: { id: string; hard: number; normal: number }[] = [];

for (const encounter of ENCOUNTERS) {
  if (ONLY.length && !ONLY.includes(encounter.id)) continue;
  const hard = runArm(encounter, 'hard', MATCHES);
  const normal = runArm(encounter, 'normal', MATCHES);
  const hardWR = hard.wins / hard.matches;
  const normWR = normal.wins / normal.matches;
  summary.push({ id: encounter.id, hard: hardWR, normal: normWR });
  const top = topPriority(hard);
  console.log(
    `${encounter.id.padEnd(12)} ${encounter.difficulty.padEnd(7)} ` +
      `${pct(hardWR).padStart(6)}  ${pct(normWR).padStart(6)}  ` +
      `${(hard.rounds / hard.matches).toFixed(2)}  ` +
      `${pct(hard.knockouts / hard.matches).padStart(5)}  ` +
      `${(hard.distinctSum / hard.matches).toFixed(1)}/${encounter.pool.length}`.padStart(9) +
      `  ${top ? `${top.id} ${pct(top.prio)}` : '-'}`,
  );
  rows.push(
    `draws h/n ${pct(hard.draws / hard.matches)}/${pct(normal.draws / normal.matches)}` +
      `  hpMargin ${(hard.hpMargin / hard.matches).toFixed(2)}`,
  );

  if (SHOW_PRIO) {
    // avgPower is what settles the "can the lesson actually happen" question: a
    // synergy card whose average contributed power sits at its printed number
    // never found its partners, however good the card reads.
    const power = new Map(
      simulate({
        matches: 600,
        seed: `pool:${encounter.id}`,
        levels: ['hard', encounter.difficulty],
        cards: encounter.pool.map((id) => getCard(id)),
        config: encounter.rounds ? { rounds: encounter.rounds } : undefined,
      }).cards.map((c) => [c.id, c.avgPower]),
    );
    const list = [...hard.appearances.entries()]
      .map(([id, seen]) => ({ id, seen, prio: (hard.firstOut.get(id) ?? 0) / seen }))
      .sort((a, b) => b.prio - a.prio);
    for (const c of list) {
      const def = getCard(c.id);
      console.log(
        `    ${c.id.padEnd(18)} prio ${pct(c.prio).padStart(6)}  rows/match ${(c.seen / hard.matches).toFixed(2)}` +
          `  printed ${def.power}  played ${(power.get(c.id) ?? def.power).toFixed(1)}`,
      );
    }
  }
}

console.log('\nper-encounter detail:');
summary.forEach((s, i) => console.log(`  ${s.id.padEnd(12)} ${rows[i]}`));

// Monotonicity: the whole point of a campaign is that the next fight is harder.
for (const model of ['hard', 'normal'] as const) {
  const bad: string[] = [];
  for (let i = 1; i < summary.length; i++) {
    const prev = summary[i - 1]!;
    const cur = summary[i]!;
    if (cur[model] > prev[model] + 0.005) bad.push(`${prev.id}->${cur.id}`);
  }
  console.log(`\n${model} model curve: ${bad.length === 0 ? 'monotonic' : `inversions at ${bad.join(', ')}`}`);
}
