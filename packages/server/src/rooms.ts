import { randomUUID } from 'node:crypto';
import {
  applyAction,
  createMatch,
  isOver,
  other,
  viewFor,
  type GameEvent,
  type MatchConfig,
  type MatchState,
  type PlayerIndex,
} from '@delezh/engine';
import { CODE_ALPHABET, CODE_LENGTH, type RoomSummary } from '@delezh/protocol';
import type { PlayerRecord } from './ratings.js';

export interface Seat {
  record: PlayerRecord;
  /** Current socket id, or null while disconnected. */
  socketId: string | null;
  /** When the reconnect grace expires. Null while connected. */
  awayUntil: number | null;
  wantsRematch: boolean;
}

export interface Room {
  code: string;
  matchId: string;
  seats: [Seat | null, Seat | null];
  state: MatchState | null;
  /** Server timestamp when the current turn auto-picks. */
  turnDeadline: number | null;
  /** True for room-code games, which do not move ratings. */
  casual: boolean;
  createdAt: number;
  scored: boolean;
}

/**
 * In-memory room store.
 *
 * Deliberately behind a small interface-shaped class so a Redis-backed
 * implementation can replace it without the socket layer noticing. Match state
 * is small (25 card instances) and fully serialisable, so moving it out of
 * process is a storage change, not a redesign.
 */
export class RoomStore {
  private readonly byCode = new Map<string, Room>();
  private readonly byPlayer = new Map<string, string>();

  create(casual: boolean): Room {
    const room: Room = {
      code: this.freshCode(),
      matchId: randomUUID(),
      seats: [null, null],
      state: null,
      turnDeadline: null,
      casual,
      createdAt: Date.now(),
      scored: false,
    };
    this.byCode.set(room.code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.byCode.get(code);
  }

  roomOf(playerId: string): Room | undefined {
    const code = this.byPlayer.get(playerId);
    return code ? this.byCode.get(code) : undefined;
  }

  /** Returns the seat index, or null when the room is full. */
  sit(room: Room, seat: Seat): PlayerIndex | null {
    const index = room.seats[0] === null ? 0 : room.seats[1] === null ? 1 : null;
    if (index === null) return null;
    room.seats[index] = seat;
    this.byPlayer.set(seat.record.id, room.code);
    return index as PlayerIndex;
  }

  seatOf(room: Room, playerId: string): PlayerIndex | null {
    if (room.seats[0]?.record.id === playerId) return 0;
    if (room.seats[1]?.record.id === playerId) return 1;
    return null;
  }

  leave(room: Room, playerId: string): void {
    const index = this.seatOf(room, playerId);
    if (index !== null) room.seats[index] = null;
    this.byPlayer.delete(playerId);
    if (room.seats[0] === null && room.seats[1] === null) this.destroy(room);
  }

  destroy(room: Room): void {
    for (const seat of room.seats) {
      if (seat) this.byPlayer.delete(seat.record.id);
    }
    this.byCode.delete(room.code);
  }

  all(): Room[] {
    return [...this.byCode.values()];
  }

  private freshCode(): string {
    for (let attempt = 0; attempt < 200; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      }
      if (!this.byCode.has(code)) return code;
    }
    // 31^4 is ~920k codes; exhausting 200 attempts means the table is genuinely
    // saturated, and silently reusing a code would cross two games' wires.
    throw new Error('room code space exhausted');
  }
}

export function summarize(room: Room): RoomSummary {
  return {
    code: room.code,
    started: room.state !== null,
    players: room.seats
      .filter((seat): seat is Seat => seat !== null)
      .map((seat) => ({
        name: seat.record.name,
        rating: seat.record.rating,
        connected: seat.socketId !== null,
      })),
  };
}

/** Starts (or restarts, for a rematch) the match in a full room. */
export function startMatch(room: Room, config?: Partial<MatchConfig>): MatchState {
  room.matchId = randomUUID();
  room.scored = false;
  for (const seat of room.seats) {
    if (seat) seat.wantsRematch = false;
  }

  const firstPicker: PlayerIndex = Math.random() < 0.5 ? 0 : 1;
  const created = createMatch({ seed: randomUUID(), firstPicker, config });
  room.state = created.state;
  room.turnDeadline = Date.now() + created.state.config.pickTimeoutMs;
  return created.state;
}

export interface AppliedTurn {
  state: MatchState;
  events: GameEvent[];
  finished: boolean;
}

/**
 * The single place a match is advanced. Every path in (a player's pick, a
 * timeout, a disconnect forfeit) goes through here so the deadline and the
 * game-over check can never be forgotten on one of them.
 */
export function advance(
  room: Room,
  player: PlayerIndex,
  action: { type: 'pick'; uid: string } | { type: 'timeout' },
): AppliedTurn {
  if (!room.state) throw new Error('no match in progress');
  const { state, events } = applyAction(room.state, player, action);
  room.state = state;
  room.turnDeadline = isOver(state) ? null : Date.now() + state.config.pickTimeoutMs;
  return { state, events, finished: isOver(state) };
}

/** The state a given seat is allowed to see. */
export function snapshotFor(room: Room, seat: PlayerIndex) {
  if (!room.state) return null;
  return {
    matchId: room.matchId,
    seat,
    state: viewFor(room.state, seat),
    opponent: {
      name: room.seats[other(seat)]?.record.name ?? '—',
      rating: room.seats[other(seat)]?.record.rating ?? 0,
    },
    turnDeadline: room.turnDeadline,
  };
}
