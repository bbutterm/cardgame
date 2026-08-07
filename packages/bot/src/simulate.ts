import { CARDS, getCard, type CardDef } from '@delezh/cards';
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
  /** firstOutOfRow / appearances — a proxy for perceived pick priority. */
  priority: number;
  /** Mean power the card actually contributed in battle. */
  avgPower: number;
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
  powerSum: number;
  powerCount: number;
}

function emptyAccum(): Accum {
  return { appearances: 0, firstOutOfRow: 0, decided: 0, wins: 0, powerSum: 0, powerCount: 0 };
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
}

/** Plays one full bot-vs-bot match and returns the outcome. */
export function playMatch(options: {
  seed: string;
  levels: [BotLevel, BotLevel];
  config?: Partial<MatchConfig>;
  cards?: readonly CardDef[];
  firstPicker?: PlayerIndex;
  random?: () => number;
  /** Called for every pick, used by the simulator to collect card stats. */
  onPick?: (player: PlayerIndex, cardId: string, firstOfRow: boolean) => void;
}): MatchOutcome {
  const created = createMatch({
    seed: options.seed,
    config: options.config,
    cards: options.cards,
    firstPicker: options.firstPicker,
  });
  let state = created.state;
  let picks = 0;
  let guard = 0;
  const rowStarted = new Set<number>();
  const results: RoundResult[] = [];

  while (state.phase !== 'gameOver' && guard++ < 500) {
    const player = state.turn;
    const uid = chooseCard(state, player, { level: options.levels[player], random: options.random });
    const instance = state.open.find((c) => c?.uid === uid);
    const firstOfRow = !rowStarted.has(state.round);
    rowStarted.add(state.round);
    if (instance && options.onPick) options.onPick(player, instance.cardId, firstOfRow);
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

    const taken: Array<{ player: PlayerIndex; cardId: string }> = [];
    const outcome = playMatch({
      seed,
      levels,
      config: options.config,
      cards,
      firstPicker,
      random: rng.next,
      onPick: (player, cardId, firstOfRow) => {
        taken.push({ player, cardId });
        const entry = bump(cardId);
        if (firstOfRow) entry.firstOutOfRow++;
      },
    });

    for (const row of outcome.final.rows) {
      for (const instance of row) bump(instance.cardId).appearances++;
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
      for (const { player, cardId } of taken) {
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
    .map(([id, a]) => ({
      id,
      appearances: a.appearances,
      firstOutOfRow: a.firstOutOfRow,
      decided: a.decided,
      wins: a.wins,
      winRate: a.decided > 0 ? a.wins / a.decided : 0.5,
      priority: a.appearances > 0 ? a.firstOutOfRow / a.appearances : 0,
      avgPower: a.powerCount > 0 ? a.powerSum / a.powerCount : getCard(id).power,
    }))
    .sort((x, y) => y.winRate - x.winRate);

  const outOfBand = cardStats
    .filter((c) => c.decided >= 30 && (c.winRate > 0.58 || c.winRate < 0.42))
    .sort((x, y) => Math.abs(y.winRate - 0.5) - Math.abs(x.winRate - 0.5));

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
