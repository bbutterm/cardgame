import type { MatchConfig } from './config.js';

export type PlayerIndex = 0 | 1;

export function other(p: PlayerIndex): PlayerIndex {
  return p === 0 ? 1 : 0;
}

/** A concrete copy of a card inside one match. `uid` is stable and unique. */
export interface CardInstance {
  uid: string;
  cardId: string;
  /** Row it belongs to (0-based). */
  row: number;
  /** Slot within the row (0-based), used for stable UI layout. */
  slot: number;
}

export type Phase =
  /** Players are alternately taking cards from the open row. */
  | 'draft'
  /** The row is empty; the battle log for this round has been produced. */
  | 'battle'
  /** Match is over. */
  | 'gameOver';

export interface PlayerState {
  hp: number;
  maxHp: number;
  /** Cards taken in the current row. */
  row: CardInstance[];
  /** Every card taken this match, in pick order. */
  taken: CardInstance[];
  /** Pending forced pass count from tempo cards. */
  skips: number;
  /** Pending bonus picks from tempo cards. */
  extras: number;
  /** True once this player has seen the upcoming row (Seer). */
  peekedRow: number | null;
  /** Rounds this player has won. */
  roundsWon: number;
  /** Set when the player was the second picker of the current row. */
  pickedSecond: boolean;
  /** Turns skipped this match — surfaced in post-match stats. */
  skipsUsed: number;
}

/** A per-card breakdown produced by the battle resolver, used for animation. */
export interface CardBattleLine {
  uid: string;
  cardId: string;
  base: number;
  bonus: number;
  total: number;
}

export interface RoundResult {
  round: number;
  lines: [CardBattleLine[], CardBattleLine[]];
  /** Row power after synergies, before opponent weaken. */
  raw: [number, number];
  /** Row power after weaken effects. */
  power: [number, number];
  weaken: [number, number];
  shield: [number, number];
  burn: [number, number];
  heal: [number, number];
  /** Net HP change applied to each player (negative = damage taken). */
  hpDelta: [number, number];
  winner: PlayerIndex | null;
  hpAfter: [number, number];
}

export interface MatchState {
  version: 1;
  seed: string;
  rngState: number;
  config: MatchConfig;
  /** All rows, pre-generated at match start. Deterministic from the seed. */
  rows: CardInstance[][];
  round: number;
  /** Cards still available in the open row; `null` marks a taken slot. */
  open: (CardInstance | null)[];
  /** Who picks first in the current row. */
  firstPicker: PlayerIndex;
  /** Whose turn it is right now. Meaningless outside the `draft` phase. */
  turn: PlayerIndex;
  /** Forced first picker for the next row, set by control cards. */
  nextFirstPicker: PlayerIndex | null;
  players: [PlayerState, PlayerState];
  phase: Phase;
  winner: PlayerIndex | null;
  /** Populated when a round has just resolved. */
  lastRound: RoundResult | null;
  /** Monotonic counter — clients use it to drop stale server snapshots. */
  seq: number;
  /** Incremented per pick; used by hosts to key the turn timer. */
  turnId: number;
}

export type Action =
  | { type: 'pick'; uid: string }
  /** The pick timer expired: the engine auto-picks for the player on turn. */
  | { type: 'timeout' };

export type GameEvent =
  | { t: 'matchStart'; hp: [number, number]; firstPicker: PlayerIndex }
  | { t: 'rowStart'; round: number; cards: CardInstance[]; firstPicker: PlayerIndex }
  | { t: 'pick'; player: PlayerIndex; card: CardInstance; auto: boolean }
  | { t: 'skip'; player: PlayerIndex }
  | { t: 'extraPick'; player: PlayerIndex }
  | { t: 'peek'; player: PlayerIndex; round: number }
  | { t: 'rowEnd'; round: number }
  | { t: 'battle'; result: RoundResult }
  | { t: 'gameOver'; winner: PlayerIndex | null }
  | { t: 'turn'; player: PlayerIndex; turnId: number };

export interface ApplyResult {
  state: MatchState;
  events: GameEvent[];
}

