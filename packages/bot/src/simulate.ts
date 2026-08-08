import { CARDS, getCard, type CardDef, type EffectKind } from '@delezh/cards';
import {
  applyAction,
  createMatch,
  createRng,
  other,
  type MatchConfig,
  type MatchState,
  type PlayerIndex,
  type RoundResult,
} from '@delezh/engine';
import { chooseCard, type BotLevel } from './index.js';

export interface SimOptions {
  matches: number;
  seed?: string;
  levels?: [BotLevel, BotLevel];
  config?: Partial<MatchConfig>;
  cards?: readonly CardDef[];
  /**
   * Play every seed twice with the first pick swapped. Removes seed bias from
   * the first-picker win-rate, which is the number we tune against.
   */
  mirrored?: boolean;
}

export interface CardStats {
  id: string;
  /** Times the card appeared in a drafted row. */
  appearances: number;
  /** Times it was the first card taken out of its row. */
  firstOutOfRow: number;
  /** Matches whose outcome was decided while this card was on a side. */
  decided: number;
  wins: number;
  /** Wins / decided. */
  winRate: number;
  /**
   * Share of rows this card's side won, ties excluded.
   *
   * This is the metric to balance against. Match win-rate is biased for any
   * card whose value depends on the holder's position — a card only taken from
   * the two-card seat inherits that seat's win-rate no matter how strong it is.
   * Row win-rate scores the card where it actually acts.
   */
  rowWinRate: number;
  rowsDecided: number;
  /**
   * Row win-rate with the seat confound removed. THIS is the balance target.
   *
   * Raw row win-rate mostly measures *when* a card gets taken: the opening pick
   * of a row belongs to the three-card side, which wins that row ~90% of the
   * time, so any high-priority card scores ~95% regardless of its own strength.
   * Here each pick is compared against the empirical win-rate of every pick made
   * at the same index within a row, and the deltas are averaged. 50% means "no
   * better than whatever else was taken from that seat".
   */
  adjustedRowWinRate: number;
  /** firstOutOfRow / appearances — a proxy for perceived pick priority. */
  priority: number;
  /** Mean power the card actually contributed in battle. */
  avgPower: number;
  /** Which of the two rates this card is balanced against. */
  metricName: 'adjusted' | 'match';
  /** The value the 42–58% corridor is applied to. */
  metric: number;
}

/**
 * Effects whose payoff lands outside the row the card was played in: tempo
 * debts, next-row pick order, information, and direct HP.
 *
 * A card carrying any of these is judged on match win-rate. Its row win-rate is
 * structurally wrong — Void Titan wins the row it lands in almost every time and
 * pays for it in the next one, so the adjusted row rate calls it broken while
 * the match rate correctly calls it fair. Everything else resolves inside its
 * own row and is judged on the adjusted row rate, which is far less noisy.
 */
const CROSS_ROW_KINDS = new Set<EffectKind>([
  'skipNextPick',
  'extraPick',
  'firstPickerSelf',
  'revealNextRow',
  'burn',
  'heal',
  // Shield cannot win a row — it only reduces what losing one costs. Judging it
  // on row win rate scored a pure shield card at 30%, because the body carrying
  // it is by definition a body that expects to lose.
  'shield',
]);

export function isCrossRow(card: CardDef): boolean {
  return card.effects.some((effect) => CROSS_ROW_KINDS.has(effect.kind));
}

export interface SimResult {
  matches: number;
  firstPickerWins: number;
  firstPickerWinRate: number;
  draws: number;
  drawRate: number;
  avgRounds: number;
  avgWinnerHp: number;
  avgLoserHp: number;
  avgPicksPerMatch: number;
  cards: CardStats[];
  /** Cards outside the 42–58% corridor, worst offender first. */
  outOfBand: CardStats[];
  elapsedMs: number;
}

interface Accum {
  appearances: number;
  firstOutOfRow: number;
  decided: number;
  wins: number;
  rowsDecided: number;
  rowWins: number;
  powerSum: number;
  powerCount: number;
  /** Row outcomes split by the pick index the card was taken at. */
  bySeat: Map<number, { n: number; wins: number }>;
}

/**
 * Row win-rate minus the win-rate every other card managed from the same seats,
 * re-centred on 0.5. A card taken only from the opening seat is judged against
 * other opening picks, not against the field.
 */
function adjust(a: Accum, baseline: Map<number, { n: number; wins: number }>): number {
  let n = 0;
  let delta = 0;
  for (const [seat, own] of a.bySeat) {
    const all = baseline.get(seat);
    if (!all || all.n === 0) continue;
    delta += own.wins - own.n * (all.wins / all.n);
    n += own.n;
  }
  return n > 0 ? 0.5 + delta / n : 0.5;
}

function emptyAccum(): Accum {
  return {
    appearances: 0,
    firstOutOfRow: 0,
    decided: 0,
    wins: 0,
    rowsDecided: 0,
    rowWins: 0,
    powerSum: 0,
    powerCount: 0,
    bySeat: new Map(),
  };
}

export interface MatchOutcome {
  winner: PlayerIndex | null;
  firstPicker: PlayerIndex;
  rounds: number;
  picks: number;
  hp: [number, number];
  final: MatchState;
  /** Every resolved row, in order. */
  results: RoundResult[];
  /** Every pick made, in order, with the seat it was made from. */
  picked: PickRecord[];
}

export interface PickRecord {
  round: number;
  /** 0-based position of this pick within its row. */
  seat: number;
  player: PlayerIndex;
  cardId: string;
}

/** Plays one full bot-vs-bot match and returns the outcome. */
export function playMatch(options: {
  seed: string;
  levels: [BotLevel, BotLevel];
  config?: Partial<MatchConfig>;
  cards?: readonly CardDef[];
  firstPicker?: PlayerIndex;
  random?: () => number;
  /** Starting HP per seat, for campaign encounters that carry a handicap. */
  hp?: [number, number];
}): MatchOutcome {
  const created = createMatch({
    seed: options.seed,
    config: options.config,
    cards: options.cards,
    firstPicker: options.firstPicker,
    hp: options.hp,
  });
  let state = created.state;
  let picks = 0;
  let guard = 0;
  const results: RoundResult[] = [];
  const picked: PickRecord[] = [];
  const seatCounter = new Map<number, number>();

  while (state.phase !== 'gameOver' && guard++ < 500) {
    const player = state.turn;
    const round = state.round;
    const uid = chooseCard(state, player, { level: options.levels[player], random: options.random });
    const instance = state.open.find((c) => c?.uid === uid);
    const seat = seatCounter.get(round) ?? 0;
    seatCounter.set(round, seat + 1);
    if (instance) picked.push({ round, seat, player, cardId: instance.cardId });

    const applied = applyAction(state, player, { type: 'pick', uid });
    state = applied.state;
    for (const event of applied.events) {
      if (event.t === 'battle') results.push(event.result);
    }
    picks++;
  }

  return {
    winner: state.winner,
    firstPicker: created.state.firstPicker,
    rounds: state.round + 1,
    picks,
    hp: [state.players[0].hp, state.players[1].hp],
    final: state,
    results,
    picked,
  };
}

export function simulate(options: SimOptions): SimResult {
  const started = Date.now();
  const matches = options.matches;
  const levels = options.levels ?? (['hard', 'hard'] as [BotLevel, BotLevel]);
  const cards = options.cards ?? CARDS;
  const mirrored = options.mirrored ?? true;
  const rng = createRng(options.seed ?? 'sim');

  const stats = new Map<string, Accum>();
  for (const card of cards) stats.set(card.id, emptyAccum());
  const bump = (id: string): Accum => {
    let entry = stats.get(id);
    if (!entry) {
      entry = emptyAccum();
      stats.set(id, entry);
    }
    return entry;
  };

  /** Row win-rate of every pick made at a given index, across all cards. */
  const seatBaseline = new Map<number, { n: number; wins: number }>();

  let firstPickerWins = 0;
  let draws = 0;
  let decisive = 0;
  let roundsTotal = 0;
  let picksTotal = 0;
  let winnerHpTotal = 0;
  let loserHpTotal = 0;

  for (let i = 0; i < matches; i++) {
    const seed = `${options.seed ?? 'sim'}#${mirrored ? Math.floor(i / 2) : i}`;
    const firstPicker: PlayerIndex = mirrored ? ((i % 2) as PlayerIndex) : ((rng.int(2) as PlayerIndex));

    const outcome = playMatch({
      seed,
      levels,
      config: options.config,
      cards,
      firstPicker,
      random: rng.next,
    });

    for (const row of outcome.final.rows) {
      for (const instance of row) bump(instance.cardId).appearances++;
    }

    for (const record of outcome.picked) {
      const entry = bump(record.cardId);
      if (record.seat === 0) entry.firstOutOfRow++;

      const result = outcome.results[record.round];
      if (!result || result.winner === null) continue;
      const won = result.winner === record.player;
      entry.rowsDecided++;
      if (won) entry.rowWins++;

      let seat = entry.bySeat.get(record.seat);
      if (!seat) {
        seat = { n: 0, wins: 0 };
        entry.bySeat.set(record.seat, seat);
      }
      seat.n++;
      if (won) seat.wins++;

      let baseline = seatBaseline.get(record.seat);
      if (!baseline) {
        baseline = { n: 0, wins: 0 };
        seatBaseline.set(record.seat, baseline);
      }
      baseline.n++;
      if (won) baseline.wins++;
    }

    for (const result of outcome.results) {
      for (const side of result.lines) {
        for (const line of side) {
          const entry = bump(line.cardId);
          entry.powerSum += line.total;
          entry.powerCount++;
        }
      }
    }

    if (outcome.winner === null) {
      draws++;
    } else {
      decisive++;
      if (outcome.winner === outcome.firstPicker) firstPickerWins++;
      winnerHpTotal += outcome.hp[outcome.winner];
      loserHpTotal += outcome.hp[other(outcome.winner)];
      const seen = new Set<string>();
      for (const { player, cardId } of outcome.picked) {
        // A card is credited once per match per side that took it.
        const key = `${player}:${cardId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const entry = bump(cardId);
        entry.decided++;
        if (player === outcome.winner) entry.wins++;
      }
    }

    roundsTotal += outcome.rounds;
    picksTotal += outcome.picks;
  }

  const cardStats: CardStats[] = [...stats.entries()]
    .map(([id, a]) => {
      const crossRow = isCrossRow(getCard(id));
      const winRate = a.decided > 0 ? a.wins / a.decided : 0.5;
      const adjustedRowWinRate = adjust(a, seatBaseline);
      return {
        id,
        appearances: a.appearances,
        firstOutOfRow: a.firstOutOfRow,
        decided: a.decided,
        wins: a.wins,
        winRate,
        rowsDecided: a.rowsDecided,
        rowWinRate: a.rowsDecided > 0 ? a.rowWins / a.rowsDecided : 0.5,
        adjustedRowWinRate,
        priority: a.appearances > 0 ? a.firstOutOfRow / a.appearances : 0,
        avgPower: a.powerCount > 0 ? a.powerSum / a.powerCount : getCard(id).power,
        metricName: (crossRow ? 'match' : 'adjusted') as 'adjusted' | 'match',
        metric: crossRow ? winRate : adjustedRowWinRate,
      };
    })
    .sort((x, y) => y.metric - x.metric);

  const outOfBand = cardStats
    .filter((c) => c.rowsDecided >= 50 && (c.metric > 0.58 || c.metric < 0.42))
    .sort((x, y) => Math.abs(y.metric - 0.5) - Math.abs(x.metric - 0.5));

  return {
    matches,
    firstPickerWins,
    firstPickerWinRate: decisive > 0 ? firstPickerWins / decisive : 0.5,
    draws,
    drawRate: draws / matches,
    avgRounds: roundsTotal / matches,
    avgWinnerHp: decisive > 0 ? winnerHpTotal / decisive : 0,
    avgLoserHp: decisive > 0 ? loserHpTotal / decisive : 0,
    avgPicksPerMatch: picksTotal / matches,
    cards: cardStats,
    outOfBand,
    elapsedMs: Date.now() - started,
  };
}
