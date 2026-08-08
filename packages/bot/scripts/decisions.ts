/**
 * Is a pick a decision, or is it execution?
 *
 * Every other probe here measures skill expression: how much better does the
 * better player do. That is not the same question as whether a pick is
 * *interesting*, and the difference is the whole of "it still feels like I'm
 * just reading the numbers". A row where one option is far ahead of the rest is
 * a row a player solves once and then merely executes — however much skill it
 * took to solve.
 *
 * So: score every legal pick with the bot's own evaluator, sort, and look at
 * the gap between the best and the second best.
 *
 *   close    the top two are within 1 point — a genuine choice
 *   clear    within 3 — a preference
 *   forced   more than 3 — there is one move and the player is typing it in
 *
 * A mechanic that raises `close` is adding gameplay even if it lowers the
 * win-rate spread, and the two can move in opposite directions. This exists so
 * that trade is visible instead of being argued about.
 *
 *   npx tsx packages/bot/scripts/decisions.ts [--matches 400]
 */
import { CARDS, type CardDef } from '@delezh/cards';
import {
  applyAction,
  createMatch,
  createRng,
  isOver,
  legalPicks,
  type MatchConfig,
  type MatchState,
  type PlayerIndex,
} from '@delezh/engine';
import { chooseCard, scorePicks } from '../src/index.js';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

const MATCHES = Number(arg('matches', '400'));

interface Density {
  close: number;
  clear: number;
  forced: number;
  singleton: number;
  meanGap: number;
  picks: number;
}

function measure(config: Partial<MatchConfig>, cards: readonly CardDef[]): Density {
  const rng = createRng('decisions');
  const d: Density = { close: 0, clear: 0, forced: 0, singleton: 0, meanGap: 0, picks: 0 };

  for (let i = 0; i < MATCHES; i++) {
    let { state } = createMatch({ seed: `dec#${Math.floor(i / 2)}`, firstPicker: (i % 2) as 0 | 1, cards, config });
    let guard = 0;
    while (!isOver(state) && guard++ < 200) {
      const player = state.turn as PlayerIndex;
      const options = legalPicks(state, player);

      if (options.length === 1) {
        d.singleton++;
      } else {
        const scores = scorePicks(state, player).sort((a, b) => b.score - a.score);
        const gap = (scores[0]?.score ?? 0) - (scores[1]?.score ?? 0);
        d.meanGap += gap;
        if (gap <= 1) d.close++;
        else if (gap <= 3) d.clear++;
        else d.forced++;
      }
      d.picks++;

      state = applyAction(state, player, {
        type: 'pick',
        uid: chooseCard(state, player, { level: 'hard', random: rng.next }),
      }).state;
    }
  }
  return d;
}

function report(label: string, config: Partial<MatchConfig>): void {
  const d = measure(config, CARDS);
  const real = d.picks - d.singleton;
  const pct = (n: number) => ((n / real) * 100).toFixed(1).padStart(5);
  console.log(
    `${label.padEnd(28)} ${pct(d.close)}%  ${pct(d.clear)}%  ${pct(d.forced)}%  ${pct(d.singleton)}%  ${(
      d.meanGap / real
    )
      .toFixed(2)
      .padStart(6)}`,
  );
}

console.log(`\n=== decision density, ${MATCHES} matches, base 30 ===\n`);
console.log('close  = the best two picks are within 1 point   (a real choice)');
console.log('clear  = within 3                                (a preference)');
console.log('forced = further apart than that                 (one move)');
console.log('only   = a single card was left to take\n');
console.log('config                        close   clear  forced    only     gap');
console.log('-'.repeat(72));
report('all 5 face-up (shipped)', {});
report('4 face-up', { revealCount: 4 });
report('3 face-up', { revealCount: 3 });
report('2 face-up', { revealCount: 2 });
console.log('');
console.log('For contrast, the rule this replaced:');
report('sum, all face-up', { rowRule: 'sum', maxRoundDamage: 0 });
console.log('');
