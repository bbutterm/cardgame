/**
 * How often is a pick actually *about* the card text?
 *
 * `texture.ts` shows that a player blind to the text loses badly, so the text
 * decides matches. That is not the same as the text being present in the
 * decision a player is making right now, and the difference is exactly what
 * "it still feels like picking by stats" would be made of.
 *
 * A pick is counted as **live** when at least one card on the table would play
 * as something other than its printed number: a synergy with its partner
 * already in the row or still available, a tempo or control effect, a weaken, a
 * shield. Anything that makes the printed number a lie.
 *
 * Reported per row position, because the answer is not the same at the start of
 * a row as at the end.
 *
 *   npx tsx packages/bot/scripts/liveness.ts [--matches 600]
 */
import { CARDS, getCard, type CardDef } from '@delezh/cards';
import {
  applyAction,
  createMatch,
  createRng,
  isOver,
  legalPicks,
  resolveLines,
  type MatchState,
  type PlayerIndex,
} from '@delezh/engine';
import { chooseCard } from '../src/index.js';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

const MATCHES = Number(arg('matches', '600'));

/** Would this card play as something other than its printed power, here, now? */
function playsAsMoreThanItsNumber(card: CardDef, myRow: CardDef[], theirRow: CardDef[]): boolean {
  if (card.effects.length === 0) return false;
  // Effects that always do something regardless of what else is on the table.
  const alwaysOn = card.effects.some((e) =>
    ['skipNextPick', 'extraPick', 'firstPickerSelf', 'revealNextRow', 'burn', 'heal', 'weaken', 'shield'].includes(
      e.kind,
    ),
  );
  if (alwaysOn) return true;

  // Conditional power: resolve it against the row it would actually join and
  // see whether the condition fires. This is the engine's own resolver, so a
  // synergy counts as live exactly when the battle would pay it.
  const withCard = resolveLines([...myRow, card], theirRow);
  const played = withCard[withCard.length - 1]?.total ?? card.power;
  return played !== card.power;
}

const liveAt = new Map<number, { live: number; total: number }>();
let liveAny = 0;
let picks = 0;

const rng = createRng('liveness');
for (let i = 0; i < MATCHES; i++) {
  let { state } = createMatch({ seed: `live#${Math.floor(i / 2)}`, firstPicker: (i % 2) as 0 | 1, cards: CARDS });
  let guard = 0;
  while (!isOver(state) && guard++ < 200) {
    const player = state.turn as PlayerIndex;
    const options = legalPicks(state, player);
    const myRow = state.players[player].row.map((c) => getCard(c.cardId));
    const theirRow = state.players[player === 0 ? 1 : 0].row.map((c) => getCard(c.cardId));

    // Index within the row: 0 is the opening pick, 4 the last card.
    const index = 5 - options.length;
    const any = options.some((o) => playsAsMoreThanItsNumber(getCard(o.cardId), myRow, theirRow));

    const bucket = liveAt.get(index) ?? { live: 0, total: 0 };
    bucket.total++;
    if (any) bucket.live++;
    liveAt.set(index, bucket);
    picks++;
    if (any) liveAny++;

    state = applyAction(state, player, {
      type: 'pick',
      uid: chooseCard(state, player, { level: 'hard', random: rng.next }),
    }).state;
  }
}

console.log(`\n=== how often the text is live, ${MATCHES} matches, base 30 ===\n`);
console.log('A pick is "live" when at least one card on the table would play as');
console.log('something other than its printed number.\n');
console.log('pick in row     live');
console.log('-'.repeat(30));
for (const index of [...liveAt.keys()].sort((a, b) => a - b)) {
  const b = liveAt.get(index)!;
  console.log(`${String(index + 1).padStart(2)} of 5      ${((b.live / b.total) * 100).toFixed(1).padStart(6)}%`);
}
console.log('-'.repeat(30));
console.log(`overall        ${((liveAny / picks) * 100).toFixed(1).padStart(6)}%\n`);
