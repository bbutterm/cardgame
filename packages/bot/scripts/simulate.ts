/**
 * Balance simulator CLI.
 *
 *   pnpm sim                          1000 matches, hard vs hard
 *   pnpm sim --matches 5000
 *   pnpm sim --levels normal,normal
 *   pnpm sim --config secondPickerHpBonus=3,startHp=22
 *   pnpm sim --json out.json
 */
import { writeFileSync } from 'node:fs';
import { ALL_CARDS, getCard } from '@delezh/cards';
import type { MatchConfig } from '@delezh/engine';
import { simulate, type SimResult } from '../src/simulate.js';
import type { BotLevel } from '../src/index.js';

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const matches = Number(arg('matches', '1000'));
const seed = arg('seed', 'sim');
const levels = (arg('levels', 'hard,hard') as string).split(',') as [BotLevel, BotLevel];

const config: Partial<MatchConfig> = {};
const configArg = arg('config');
if (configArg) {
  for (const pair of configArg.split(',')) {
    const [key, value] = pair.split('=');
    if (!key || value === undefined) continue;
    (config as Record<string, unknown>)[key] = Number.isNaN(Number(value)) ? value : Number(value);
  }
}

const result = simulate({ matches, seed, levels, config, cards: ALL_CARDS, mirrored: true });
report(result);

const jsonPath = arg('json');
if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`\nwrote ${jsonPath}`);
}

function pct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function report(r: SimResult): void {
  console.log(`\n=== ${r.matches} matches (${levels.join(' vs ')}), ${(r.elapsedMs / 1000).toFixed(1)}s ===`);
  console.log(`first-picker win rate : ${pct(r.firstPickerWinRate)}   ${band(r.firstPickerWinRate, 0.46, 0.54)}`);
  console.log(`draws                 : ${pct(r.drawRate)}`);
  console.log(`avg rows played       : ${r.avgRounds.toFixed(2)}`);
  console.log(`avg picks per match   : ${r.avgPicksPerMatch.toFixed(1)}`);
  console.log(`avg hp winner / loser : ${r.avgWinnerHp.toFixed(1)} / ${r.avgLoserHp.toFixed(1)}`);

  console.log('\ncard                 wr      prio   avgPow  seen');
  console.log('-'.repeat(52));
  for (const card of r.cards) {
    const def = getCard(card.id);
    const flag = card.winRate > 0.58 || card.winRate < 0.42 ? ' <<<' : '';
    console.log(
      `${card.id.padEnd(20)} ${pct(card.winRate).padStart(6)}  ${pct(card.priority).padStart(6)}  ${card.avgPower
        .toFixed(1)
        .padStart(5)}  ${String(card.appearances).padStart(5)}  (p${def.power})${flag}`,
    );
  }

  if (r.outOfBand.length > 0) {
    console.log(`\n!! ${r.outOfBand.length} card(s) outside the 42-58% corridor: ${r.outOfBand.map((c) => c.id).join(', ')}`);
  } else {
    console.log('\nAll cards inside the 42-58% corridor.');
  }
}

function band(value: number, low: number, high: number): string {
  return value >= low && value <= high ? 'OK' : 'OUT OF BAND';
}
