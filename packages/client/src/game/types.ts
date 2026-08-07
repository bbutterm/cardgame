import type { GameEvent, MatchState, PlayerIndex, RoundResult } from '@delezh/engine';

export type MatchStatus =
  | 'connecting'
  | 'waiting'
  | 'playing'
  /** The opponent dropped; the reconnect grace period is running. */
  | 'opponentAway'
  /** This client lost its own connection and socket.io is retrying. */
  | 'reconnecting'
  | 'over'
  | 'error';

export interface EmoteMessage {
  id: number;
  from: PlayerIndex;
  key: string;
}

/**
 * What a match screen needs, regardless of whether the opponent is a local bot
 * or a player on the other side of a socket. Both implementations produce the
 * same shape so `MatchScreen` never branches on the mode.
 */
export interface MatchController {
  state: MatchState | null;
  me: PlayerIndex;
  status: MatchStatus;
  /** True when it is this player's turn and no animation is in the way. */
  canPick: boolean;
  pick: (uid: string) => void;
  /** Milliseconds left on the pick timer, or null when no timer is running. */
  timeLeftMs: number | null;
  /** Set while a resolved row is waiting to be animated. */
  battle: RoundResult | null;
  dismissBattle: () => void;
  /** Transient notices, e.g. "turn skipped" or "extra pick". */
  notices: GameEvent[];
  emotes: EmoteMessage[];
  sendEmote: (key: string) => void;
  rematch: () => void;
  /** This player has asked and is waiting on the opponent. */
  rematchPending: boolean;
  /** The opponent has asked and is waiting on this player. */
  opponentWantsRematch: boolean;
  leave: () => void;
  /** Rating delta once the server has scored the match. Null for bot games. */
  ratingDelta: number | null;
  opponentName: string | null;
  /** Seconds left for a disconnected opponent to return. */
  reconnectSeconds: number | null;
}
