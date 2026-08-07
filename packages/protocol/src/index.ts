import type { GameEvent, MatchState, PlayerIndex } from '@delezh/engine';

/**
 * The socket contract between client and server.
 *
 * The client is never trusted: it sends intent (`pick`, `emote`, `rematch`) and
 * receives state. Every action is validated against the server's own copy of
 * the match, and the state each player receives is filtered through
 * `viewFor()`, so a player cannot read rows they have not earned sight of.
 */

export const PROTOCOL_VERSION = 1;

/**
 * A cache-first service worker means an old client can outlive a deploy, so the
 * server checks this on identify and refuses a mismatch rather than letting a
 * stale client desync in some subtler way later.
 */
export interface PlayerIdentity {
  /** Stable per-device id; lets a player reclaim their seat after a reload. */
  id: string;
  name: string;
  protocol?: number;
}

export interface RoomSummary {
  code: string;
  /** Set once both seats are filled. */
  started: boolean;
  players: Array<{ name: string; rating: number; connected: boolean }>;
}

export interface MatchSnapshot {
  matchId: string;
  /** The recipient's seat. */
  seat: PlayerIndex;
  state: MatchState;
  opponent: { name: string; rating: number };
  /** Server time when the current turn expires, so clients agree on the clock. */
  turnDeadline: number | null;
}

export interface MatchOver {
  matchId: string;
  winner: PlayerIndex | null;
  /** Signed change for the recipient. Zero for unranked rooms. */
  ratingDelta: number;
  newRating: number;
}

export interface LeaderboardRow {
  rank: number;
  name: string;
  rating: number;
  games: number;
  wins: number;
  /** Set by the server for the requesting player. Never a raw id — see below. */
  isYou?: boolean;
}

/**
 * The emotes a client may send. The server rejects anything else outright:
 * without this the field is a free-text channel straight into the opponent's
 * face, since the client renders an unknown key verbatim as its own fallback.
 */
export const EMOTE_KEYS = [
  'emote.gg',
  'emote.nice',
  'emote.wow',
  'emote.thinking',
  'emote.hurry',
  'emote.oops',
  'emote.sorry',
  'emote.rematch',
] as const;

export type EmoteKey = (typeof EMOTE_KEYS)[number];

export function isEmoteKey(value: unknown): value is EmoteKey {
  return typeof value === 'string' && (EMOTE_KEYS as readonly string[]).includes(value);
}

/** Client -> server. */
export interface ClientToServer {
  identify: (identity: PlayerIdentity, ack: (ok: { ok: true; rating: number } | ProtocolError) => void) => void;
  createRoom: (ack: (result: { ok: true; room: RoomSummary } | ProtocolError) => void) => void;
  joinRoom: (code: string, ack: (result: { ok: true; room: RoomSummary } | ProtocolError) => void) => void;
  leaveRoom: () => void;
  queue: (ack: (result: { ok: true } | ProtocolError) => void) => void;
  cancelQueue: () => void;
  pick: (matchId: string, uid: string, ack: (result: { ok: true } | ProtocolError) => void) => void;
  emote: (key: string) => void;
  rematch: () => void;
  /** Asks the server to re-send the current snapshot after a reconnect. */
  resync: () => void;
}

/** Server -> client. */
export interface ServerToClient {
  room: (room: RoomSummary) => void;
  matchStart: (snapshot: MatchSnapshot) => void;
  /** Full authoritative state plus the events that produced it, for animation. */
  matchUpdate: (snapshot: MatchSnapshot, events: GameEvent[]) => void;
  matchOver: (result: MatchOver) => void;
  emote: (from: PlayerIndex, key: string) => void;
  opponentLeft: () => void;
  /** Opponent dropped; `until` is a server timestamp for the grace deadline. */
  opponentAway: (until: number) => void;
  opponentBack: () => void;
  /** The opponent has asked for a rematch and is waiting on this player. */
  rematchOffered: () => void;
  queued: (position: number) => void;
  error: (error: ProtocolError) => void;
}

export type ProtocolErrorCode =
  | 'not_identified'
  | 'room_not_found'
  | 'room_full'
  | 'not_in_match'
  | 'illegal_move'
  | 'rate_limited'
  | 'internal';

export interface ProtocolError {
  ok: false;
  code: ProtocolErrorCode;
  message?: string;
}

export function protocolError(code: ProtocolErrorCode, message?: string): ProtocolError {
  return { ok: false, code, message };
}

/**
 * Room codes: 4 characters from an alphabet with no 0/O or 1/I/L, because they
 * get read aloud and typed on a phone keyboard.
 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;

export function isValidCode(code: string): boolean {
  if (code.length !== CODE_LENGTH) return false;
  return [...code].every((char) => CODE_ALPHABET.includes(char));
}
