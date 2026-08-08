/**
 * Does the card text matter, or is this still a numbers game?
 *
 * The complaint is that a player still picks by stats. `depth.ts` answers a
 * different question — it shows that taking the *biggest* number loses. That is
 * not the same as showing that the text is worth reading.
 *
 * So: a **stats-only** player, who sees every card as its printed power and
 * nothing else, plays to fit the target as well as it can, and is blind to
 * every synergy, tempo cost and denial line in the game. Against the real bot:
 *
 *   - if it holds up, the text is decoration and the game is arithmetic;
 *   - if it loses badly, the numbers are the surface and the text is the game.
 *
 * Run against several pools, because "the cards carry the game" is a claim about
 * a *set*, not about the rules.
 *
 *   npx tsx packages/bot/scripts/texture.ts [--matches 1200]
 */
import { CARDS, ALL_CARDS, getCard, type CardDef } from '@delezh/cards';
import {
  applyAction,
  createMatch,
  createRng,
  DEFAULT_CONFIG,
  isOver,
  legalPicks,
  type MatchState,
  type PlayerIndex,
} from '@delezh/engine';
import { chooseCard } from '../src/index.js';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

const MATCHES = Number(arg('matches', '1200'));
const TARGET = DEFAULT_CONFIG.rowTarget;

/**
 * Picks as if every card were a vanilla body of its printed power: take the one
 * that leaves this row closest to the target without going over, and if nothing
 * fits, take the smallest. No effect is ever consulted.
 */
function statsOnly(state: MatchState, player: PlayerIndex): string {
  const mine = state.players[player].row.reduce((sum, c) => sum + getCard(c.cardId).power, 0);
  const picks = legalPicks(state, player);

  let best = picks[0]!;
  let bestScore = -Infinity;
  for (const p of picks) {
    const after = mine + getCard(p.cardId).power;
    // Distance to the target, with anything over it strictly worse than
    // anything under it. This is the whole of the strategy.
    const score = after > TARGET ? -100 - (after - TARGET) : -(TARGET - after);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best.uid;
}

function run(label: string, cards: readonly CardDef[]): void {
  const rng = createRng(`texture-${label}`);
  let statsWins = 0;
  let draws = 0;

  for (let i = 0; i < MATCHES; i++) {
    let { state } = createMatch({ seed: `tex#${Math.floor(i / 2)}`, firstPicker: (i % 2) as 0 | 1, cards });
    let guard = 0;
    while (!isOver(state) && guard++ < 200) {
      const p = state.turn;
      const uid = p === 0 ? statsOnly(state, p) : chooseCard(state, p, { level: 'hard', random: rng.next });
      state = applyAction(state, p, { type: 'pick', uid }).state;
    }
    if (state.winner === 0) statsWins++;
    else if (state.winner === null) draws++;
  }

  const decisive = MATCHES - draws;
  const rate = statsWins / decisive;
  const verdict = rate > 0.42 ? 'text barely matters' : rate > 0.3 ? 'text matters' : 'text decides';
  console.log(`${label.padEnd(28)} ${(rate * 100).toFixed(1).padStart(5)}%   ${verdict}`);
}

const VANILLA = CARDS.filter((c) => c.effects.length === 0);
const WITH_TEXT = CARDS.filter((c) => c.effects.length > 0);

console.log(`\n=== a stats-only player vs the hard bot, ${MATCHES} matches, target ${TARGET} ===`);
console.log('\nStats-only reads every card as its printed number and nothing else.\n');
console.log('pool                          wins');
console.log('-'.repeat(58));
run(`vanilla only (${VANILLA.length})`, VANILLA);
run(`base set (${CARDS.length})`, CARDS);
run(`all cards (${ALL_CARDS.length})`, ALL_CARDS);
run(`text-heavy (${WITH_TEXT.length})`, WITH_TEXT);
console.log('');
