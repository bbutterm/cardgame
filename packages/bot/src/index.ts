import { getCard, type CardDef } from '@delezh/cards';
import {
  applyAction,
  legalPicks,
  other,
  rowPower,
  type CardInstance,
  type MatchConfig,
  type MatchState,
  type PlayerIndex,
} from '@delezh/engine';

export const BOT_LEVELS = ['easy', 'normal', 'hard'] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];

export interface BotOptions {
  level: BotLevel;
  /** Deterministic tie-breaking / noise source. */
  random?: () => number;
}

/** How much the bot cares about what the opponent would have gained. */
const DENY_WEIGHT: Record<BotLevel, number> = { easy: 0, normal: 0.35, hard: 0.7 };
/** Random jitter added to every score, in power points. */
const NOISE: Record<BotLevel, number> = { easy: 1.5, normal: 0.4, hard: 0.12 };

function defs(cards: CardInstance[]): CardDef[] {
  return cards.map((c) => getCard(c.cardId));
}

/**
 * Marginal value of adding `card` to `side`, measured against `foe`.
 * Counts synergies in both directions: the new card's own bonus and the bonus
 * it grants to cards already on the side.
 */
function marginalPower(
  side: CardDef[],
  foe: CardDef[],
  card: CardDef,
  pickedSecond: boolean,
  rule: Pick<MatchConfig, 'rowRule' | 'rowTarget'>,
): number {
  const before = rowPower(side, foe, pickedSecond, 20, 20, rule);
  const after = rowPower([...side, card], foe, pickedSecond, 20, 20, rule);
  return after - before;
}

/** Value of the non-power effects, expressed in power points. */
function utilityValue(card: CardDef, state: MatchState, player: PlayerIndex): number {
  let value = 0;
  const roundsLeft = state.config.rounds - state.round - 1;
  for (const effect of card.effects) {
    switch (effect.kind) {
      case 'weaken':
        value += effect.amount;
        break;
      case 'shield':
        value += effect.amount * 0.7;
        break;
      case 'burn':
        value += effect.amount * 1.1;
        break;
      case 'heal':
        value += effect.amount * (state.players[player].hp < state.players[player].maxHp ? 0.9 : 0.1);
        break;
      case 'firstPickerSelf':
        // Worthless in the final row; a full extra card anywhere else.
        value += roundsLeft > 0 ? 2.2 : 0;
        break;
      case 'revealNextRow':
        value += roundsLeft > 0 ? 0.6 : 0;
        break;
      case 'extraPick':
        value += 2.0;
        break;
      case 'skipNextPick':
        value -= 3.2;
        break;
      default:
        break;
    }
  }
  return value;
}

/** Mean printed power across the set, used to guess what a forced pick costs. */
const AVG_POWER = 2.9;

/**
 * Under `closest`, the skill the rule creates is leaving room for the cards you
 * have not taken yet.
 *
 * `marginalPower` is myopic: it prices this pick alone, so a card that lands
 * the row exactly on the target scores best — and then the next *forced* pick
 * busts it. A player who cannot see that is playing a different, worse game,
 * which is what a 93% gap between the rollout bot and the heuristic bot was
 * actually measuring.
 *
 * Returns 0 for every other rule, so nothing else changes shape.
 */
function headroom(
  state: MatchState,
  player: PlayerIndex,
  mine: CardDef[],
  theirs: CardDef[],
  card: CardDef,
  pickedSecond: boolean,
  rule: { rowRule: MatchConfig['rowRule']; rowTarget: number },
): number {
  if (rule.rowRule !== 'closest') return 0;

  // Raw, not clamped: a busted row reads as 0 through `rowPower`, and the point
  // here is to measure how far over the edge the row is heading.
  const after = rowPower([...mine, card], theirs, pickedSecond);

  // Cards left once this one is gone. Turns alternate, so of those the opponent
  // takes the next; this side is forced into the rest by halves.
  const left = Math.max(0, legalPicks(state, player).length - 1);
  const forced = Math.floor(left / 2);

  const projected = after + forced * AVG_POWER;
  const over = projected - rule.rowTarget;
  // Only overshoot is punished. Undershooting is already priced by `gain`,
  // which wants the total as high as the clamp allows.
  return over > 0 ? -over : 0;
}

/** Fast heuristic score — used directly by easy/normal and inside hard rollouts. */
function heuristicScore(
  state: MatchState,
  player: PlayerIndex,
  instance: CardInstance,
  denyWeight: number,
): number {
  const card = getCard(instance.cardId);
  const me = state.players[player];
  const foe = state.players[other(player)];
  const mine = defs(me.row);
  const theirs = defs(foe.row);

  const rule = { rowRule: state.config.rowRule, rowTarget: state.config.rowTarget };
  const gain =
    marginalPower(mine, theirs, card, me.pickedSecond, rule) +
    utilityValue(card, state, player) +
    headroom(state, player, mine, theirs, card, me.pickedSecond, rule);
  // The deny term has to price the card as the opponent would hold it — tempo
  // cost included. Otherwise the bot "denies" a bomb the opponent could not
  // afford anyway, and overpays for it.
  const deny = marginalPower(theirs, mine, card, foe.pickedSecond, rule) + utilityValue(card, state, other(player));

  return gain + denyWeight * deny;
}

/** Greedy policy used to roll the rest of a row forward inside `hard`. */
function greedyUid(state: MatchState, player: PlayerIndex): string | null {
  const options = legalPicks(state, player);
  if (options.length === 0) return null;
  let best = options[0] as CardInstance;
  let bestScore = heuristicScore(state, player, best, 0.35);
  for (const option of options.slice(1)) {
    const score = heuristicScore(state, player, option, 0.35);
    if (score > bestScore) {
      best = option;
      bestScore = score;
    }
  }
  return best.uid;
}

/**
 * Plays the current row to its end with a greedy policy and scores the position
 * that results. Because the real engine drives the rollout, tempo effects
 * (skips, extra picks, forced first pick) are modelled exactly rather than
 * guessed at.
 */
function rolloutScore(state: MatchState, player: PlayerIndex): number {
  let current = state;
  const startRound = current.round;
  let guard = 0;

  while (current.phase === 'draft' && current.round === startRound && guard++ < 24) {
    const uid = greedyUid(current, current.turn);
    if (uid === null) break;
    current = applyAction(current, current.turn, { type: 'pick', uid }).state;
  }

  const me = current.players[player];
  const foe = current.players[other(player)];
  let score = me.hp - foe.hp;

  // Position carried into the next row.
  score -= me.skips * 1.4;
  score += me.extras * 1.4;
  score += foe.skips * 1.0;
  score -= foe.extras * 1.0;
  if (current.nextFirstPicker === player) score += 1.2;
  else if (current.nextFirstPicker === other(player)) score -= 1.2;
  if (current.phase === 'draft' && current.firstPicker === player) score += 0.8;

  return score;
}

/** Picks a card for `player`. Throws if it is not that player's turn. */
export function chooseCard(state: MatchState, player: PlayerIndex, options: BotOptions): string {
  const available = legalPicks(state, player);
  if (available.length === 0) throw new Error('bot asked to pick when it cannot');

  const random = options.random ?? Math.random;
  const noise = NOISE[options.level];
  const denyWeight = DENY_WEIGHT[options.level];

  let best = available[0] as CardInstance;
  let bestScore = -Infinity;

  for (const instance of available) {
    let score: number;
    if (options.level === 'hard') {
      const after = applyAction(state, player, { type: 'pick', uid: instance.uid }).state;
      score = rolloutScore(after, player);
    } else if (options.level === 'easy') {
      // Reads the printed number and nothing else.
      score = getCard(instance.cardId).power;
    } else {
      score = heuristicScore(state, player, instance, denyWeight);
    }
    score += (random() - 0.5) * noise;
    if (score > bestScore) {
      best = instance;
      bestScore = score;
    }
  }

  return best.uid;
}

/** Convenience: apply the bot's choice straight to the state. */
export function botMove(state: MatchState, player: PlayerIndex, options: BotOptions) {
  return applyAction(state, player, { type: 'pick', uid: chooseCard(state, player, options) });
}

export function botLabel(level: BotLevel): string {
  return `bot:${level}`;
}
