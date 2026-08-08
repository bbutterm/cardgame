import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server, type Socket } from 'socket.io';
import { isOver, other, type MatchConfig, type PlayerIndex } from '@delezh/engine';
import {
  isEmoteKey,
  isValidCode,
  protocolError,
  PROTOCOL_VERSION,
  type ClientToServer,
  type PlayerIdentity,
  type ServerToClient,
} from '@delezh/protocol';
import { createRatingRepository, scoreMatch, type PlayerRecord, type RatingRepository } from './ratings.js';
import { advance, RoomStore, snapshotFor, startMatch, summarize, type Room, type Seat } from './rooms.js';
import { createStaticHandler, type StaticHandler } from './static.js';

const TICK_MS = 500;
/** Rooms nobody ever joined are swept after this long. */
const EMPTY_ROOM_TTL_MS = 15 * 60 * 1000;

export interface ServerOptions {
  port?: number;
  repository?: RatingRepository;
  /** Overrides the pick timer and reconnect grace, so tests need not wait. */
  matchConfig?: Partial<MatchConfig>;
  /**
   * Directory of the built client to serve. Defaults to the bundle's sibling
   * `client/`, which is where `pnpm build` puts it; `false` disables serving.
   */
  clientDir?: string | false;
}

export interface RunningServer {
  port: number;
  close: () => Promise<void>;
  /** Exposed for tests and for a future admin endpoint. */
  stats: () => { rooms: number; queue: number; identities: number };
}

/**
 * Builds and starts the whole server. Everything it owns is created here rather
 * than at module scope, so a test can run several isolated instances in one
 * process and shut them down cleanly.
 */
export function startServer(options: ServerOptions = {}): Promise<RunningServer> {
const PORT = options.port ?? Number(process.env.PORT ?? 8787);
const matchConfig = options.matchConfig;

const repo = options.repository ?? createRatingRepository();
const rooms = new RoomStore();
/** playerId -> socket, so a reconnect can find its seat. */
const identities = new Map<string, { record: PlayerRecord; socketId: string }>();
/** Quick-match queue of player ids, oldest first. */
const queue: string[] = [];

/**
 * Per-socket token bucket. Every handler was previously unmetered, so a single
 * socket could fill `identities` and the ratings file by looping `identify`
 * with random ids, or flood the opponent with emotes.
 */
const buckets = new WeakMap<object, Map<string, { tokens: number; at: number }>>();

function allow(socket: object, action: string, perSecond: number, burst: number): boolean {
  let forSocket = buckets.get(socket);
  if (!forSocket) {
    forSocket = new Map();
    buckets.set(socket, forSocket);
  }
  const now = Date.now();
  const entry = forSocket.get(action) ?? { tokens: burst, at: now };
  entry.tokens = Math.min(burst, entry.tokens + ((now - entry.at) / 1000) * perSecond);
  entry.at = now;
  if (entry.tokens < 1) {
    forSocket.set(action, entry);
    return false;
  }
  entry.tokens -= 1;
  forSocket.set(action, entry);
  return true;
}

/** Drops a player out of whatever room they are in, forfeiting a live match. */
function releaseSeat(playerId: string, forfeit: boolean): void {
  const room = rooms.roomOf(playerId);
  if (!room) return;
  const seat = rooms.seatOf(room, playerId);
  if (seat !== null && forfeit && room.state && !isOver(room.state) && !room.scored) {
    void finishMatch(room, seat).catch((error: unknown) => console.error('[forfeit]', error));
  }
  if (seat !== null) seatSocket(room.seats[other(seat)])?.emit('opponentLeft');
  rooms.leave(room, playerId);
}

/**
 * Set once the client bundle is located. Requests that arrive before that are
 * answered from the API surface alone, which is all that exists in tests.
 */
let serveStatic: StaticHandler | null = null;

const http = createServer((req, res) => {
  // A tiny REST surface for things that do not need a socket.
  if (req.url?.startsWith('/api/leaderboard')) {
    const viewer = new URL(req.url, 'http://localhost').searchParams.get('me') ?? undefined;
    repo.top(50, viewer).then(
      (rows) => {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(rows));
      },
      (error: unknown) => {
        console.error('[api] leaderboard failed:', error);
        res.writeHead(500, { 'content-type': 'application/json' }).end('{"error":"internal"}');
      },
    );
    return;
  }
  if (req.url === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.all().length, queue: queue.length }));
    return;
  }
  if (serveStatic) {
    void serveStatic(req, res).then(
      (handled) => {
        if (!handled) res.writeHead(404).end();
      },
      (error: unknown) => {
        console.error('[static]', error);
        if (!res.headersSent) res.writeHead(500).end();
      },
    );
    return;
  }
  res.writeHead(404).end();
});

const io = new Server<ClientToServer, ServerToClient>(http, {
  // The client is served from this same origin, so cross-origin sockets are
  // never a legitimate case. `origin: true` reflected whatever asked, which let
  // any page on the internet open a socket here.
  cors: { origin: false },
  // Mobile networks drop and resume constantly; a generous timeout keeps a
  // brief tunnel change from being treated as a disconnect at all.
  pingTimeout: 25_000,
  pingInterval: 10_000,
});

// ---------------------------------------------------------------- broadcast

function seatSocket(seat: Seat | null): Socket<ClientToServer, ServerToClient> | undefined {
  if (!seat?.socketId) return undefined;
  return io.sockets.sockets.get(seat.socketId);
}

function pushRoom(room: Room): void {
  const summary = summarize(room);
  for (const seat of room.seats) seatSocket(seat)?.emit('room', summary);
}

function pushMatchStart(room: Room): void {
  for (const index of [0, 1] as PlayerIndex[]) {
    const snapshot = snapshotFor(room, index);
    if (snapshot) seatSocket(room.seats[index])?.emit('matchStart', snapshot);
  }
}

function pushUpdate(room: Room, events: Parameters<ServerToClient['matchUpdate']>[1]): void {
  for (const index of [0, 1] as PlayerIndex[]) {
    const snapshot = snapshotFor(room, index);
    if (snapshot) seatSocket(room.seats[index])?.emit('matchUpdate', snapshot, events);
  }
}

// -------------------------------------------------------------- match ending

async function finishMatch(room: Room, forfeitBy: PlayerIndex | null = null): Promise<void> {
  if (room.scored || !room.state) return;
  room.scored = true;
  room.turnDeadline = null;
  // A forfeit ends the match as surely as running out of rows does. Without
  // this the winner's board stays in `draft` forever and the result screen,
  // which routes on the phase, never appears.
  if (forfeitBy !== null) {
    room.state.phase = 'gameOver';
    room.state.winner = other(forfeitBy);
  }

  const [a, b] = room.seats;
  const winner: PlayerIndex | null = forfeitBy !== null ? other(forfeitBy) : room.state.winner;

  let deltas: [number, number] = [0, 0];
  let ratings: [number, number] = [a?.record.rating ?? 0, b?.record.rating ?? 0];

  if (a && b && !room.casual) {
    const outcome = winner === null ? 'draw' : winner === 0 ? 'win' : 'loss';
    const scored = await scoreMatch(repo, a.record, b.record, outcome);
    deltas = scored.deltas;
    ratings = scored.ratings;
  }

  for (const index of [0, 1] as PlayerIndex[]) {
    seatSocket(room.seats[index])?.emit('matchOver', {
      matchId: room.matchId,
      winner,
      ratingDelta: deltas[index],
      newRating: ratings[index],
    });
  }
}

// ------------------------------------------------------------------ matching

function tryMatchmake(): void {
  while (queue.length >= 2) {
    const first = queue.shift();
    const second = queue.shift();
    if (!first || !second) return;

    const a = identities.get(first);
    const b = identities.get(second);
    // A queued player who vanished is simply dropped; the other goes back to
    // the front of the queue rather than losing their place.
    if (!a) {
      if (b) queue.unshift(second);
      continue;
    }
    if (!b) {
      queue.unshift(first);
      continue;
    }

    const room = rooms.create(false);
    for (const identity of [a, b]) {
      rooms.sit(room, { record: identity.record, socketId: identity.socketId, awayUntil: null, wantsRematch: false });
    }
    startMatch(room, matchConfig);
    pushRoom(room);
    pushMatchStart(room);
  }
}

function dequeue(playerId: string): void {
  const index = queue.indexOf(playerId);
  if (index >= 0) queue.splice(index, 1);
}

// -------------------------------------------------------------------- socket

io.on('connection', (socket) => {
  let playerId: string | null = null;

  const currentRoom = (): Room | undefined => (playerId ? rooms.roomOf(playerId) : undefined);

  socket.on('identify', (identity: PlayerIdentity, ack) => {
    if (!identity?.id || typeof identity.id !== 'string' || identity.id.length > 64) {
      return ack(protocolError('not_identified'));
    }
    // One identity per socket: re-identifying was how a single connection could
    // register unbounded players.
    if (playerId !== null && playerId !== identity.id) {
      return ack(protocolError('rate_limited', 'already identified'));
    }
    if (!allow(socket, 'identify', 1, 3)) return ack(protocolError('rate_limited'));
    // A cache-first service worker can keep an old client alive across a deploy.
    if (identity.protocol !== undefined && identity.protocol !== PROTOCOL_VERSION) {
      return ack(protocolError('internal', `protocol ${identity.protocol} != ${PROTOCOL_VERSION}`));
    }
    void (async () => {
      try {
      const record = await repo.ensure(identity.id, (identity.name ?? '').slice(0, 20));
      playerId = record.id;
      identities.set(record.id, { record, socketId: socket.id });

      // Reclaim a live seat: this is the reconnect path.
      const room = rooms.roomOf(record.id);
      if (room) {
        const seat = rooms.seatOf(room, record.id);
        if (seat !== null && room.seats[seat]) {
          room.seats[seat].socketId = socket.id;
          room.seats[seat].awayUntil = null;
          seatSocket(room.seats[other(seat)])?.emit('opponentBack');
          pushRoom(room);
          const snapshot = snapshotFor(room, seat);
          if (snapshot) socket.emit('matchStart', snapshot);
        }
      }
      ack({ ok: true, rating: record.rating });
      } catch (error) {
        console.error('[identify]', error);
        ack(protocolError('internal'));
      }
    })();
  });

  socket.on('createRoom', (ack) => {
    const identity = playerId ? identities.get(playerId) : undefined;
    if (!identity) return ack(protocolError('not_identified'));

    if (!allow(socket, 'room', 1, 5)) return ack(protocolError('rate_limited'));
    releaseSeat(identity.record.id, true);

    const room = rooms.create(true);
    rooms.sit(room, { record: identity.record, socketId: socket.id, awayUntil: null, wantsRematch: false });
    ack({ ok: true, room: summarize(room) });
    pushRoom(room);
  });

  socket.on('joinRoom', (rawCode: string, ack) => {
    const identity = playerId ? identities.get(playerId) : undefined;
    if (!identity) return ack(protocolError('not_identified'));

    if (!allow(socket, 'room', 1, 5)) return ack(protocolError('rate_limited'));
    const code = String(rawCode ?? '').trim().toUpperCase();
    if (!isValidCode(code)) return ack(protocolError('room_not_found'));

    const room = rooms.get(code);
    if (!room) return ack(protocolError('room_not_found'));

    // Joining a different room while already seated would orphan the old one:
    // RoomStore keys players by id, so the abandoned seat becomes unreachable
    // and its grace sweep never fires.
    const current = rooms.roomOf(identity.record.id);
    if (current && current.code !== code) releaseSeat(identity.record.id, true);

    // Rejoining a room you already sit in is a reconnect, not an error.
    const existingSeat = rooms.seatOf(room, identity.record.id);
    if (existingSeat === null) {
      const seat = rooms.sit(room, {
        record: identity.record,
        socketId: socket.id,
        awayUntil: null,
        wantsRematch: false,
      });
      if (seat === null) return ack(protocolError('room_full'));
    } else {
      room.seats[existingSeat]!.socketId = socket.id;
    }

    ack({ ok: true, room: summarize(room) });
    pushRoom(room);

    if (room.seats[0] && room.seats[1] && !room.state) {
      startMatch(room, matchConfig);
      pushMatchStart(room);
    }
  });

  socket.on('leaveRoom', () => {
    if (!playerId) return;
    // Walking out of a live match forfeits it, so it cannot be used to dodge a
    // loss in a ranked game.
    releaseSeat(playerId, true);
  });

  socket.on('queue', (ack) => {
    if (!playerId || !identities.has(playerId)) return ack(protocolError('not_identified'));
    if (!allow(socket, 'queue', 0.5, 3)) return ack(protocolError('rate_limited'));
    releaseSeat(playerId, true);
    dequeue(playerId);
    queue.push(playerId);
    ack({ ok: true });
    socket.emit('queued', queue.indexOf(playerId) + 1);
    tryMatchmake();
  });

  socket.on('cancelQueue', () => {
    if (playerId) dequeue(playerId);
  });

  socket.on('pick', (matchId: string, uid: string, ack) => {
    const room = currentRoom();
    if (!room || !room.state || !playerId) return ack(protocolError('not_in_match'));
    if (room.matchId !== matchId) return ack(protocolError('not_in_match', 'stale match id'));

    const seat = rooms.seatOf(room, playerId);
    if (seat === null) return ack(protocolError('not_in_match'));
    if (room.state.turn !== seat) return ack(protocolError('illegal_move', 'not your turn'));

    try {
      const { events, finished } = advance(room, seat, { type: 'pick', uid });
      ack({ ok: true });
      pushUpdate(room, events);
      if (finished) void finishMatch(room).catch((e: unknown) => console.error('[finish]', e));
    } catch (error) {
      // The engine is the authority; a rejected action means the client's view
      // drifted, so re-sync it rather than just reporting an error.
      ack(protocolError('illegal_move', error instanceof Error ? error.message : undefined));
      const snapshot = snapshotFor(room, seat);
      if (snapshot) socket.emit('matchStart', snapshot);
    }
  });

  socket.on('emote', (key: string) => {
    const room = currentRoom();
    if (!room || !playerId) return;
    // Anything not in the shared list is free text on the opponent's screen,
    // because an unknown key falls back to rendering itself.
    if (!isEmoteKey(key)) return;
    if (!allow(socket, 'emote', 1, 4)) return;
    const seat = rooms.seatOf(room, playerId);
    if (seat === null) return;
    seatSocket(room.seats[other(seat)])?.emit('emote', seat, key);
  });

  socket.on('rematch', () => {
    const room = currentRoom();
    if (!room || !playerId) return;
    // Without this, two rematch calls mid-match reseed a live board — an exit
    // from a losing position in a ranked game.
    if (!room.state || !isOver(room.state)) return;
    if (!allow(socket, 'rematch', 1, 3)) return;
    const seat = rooms.seatOf(room, playerId);
    if (seat === null || !room.seats[seat]) return;

    room.seats[seat].wantsRematch = true;
    const opponent = room.seats[other(seat)];
    if (!opponent) return;

    if (opponent.wantsRematch) {
      startMatch(room, matchConfig);
      pushMatchStart(room);
    } else {
      seatSocket(opponent)?.emit('rematchOffered');
    }
  });

  socket.on('resync', () => {
    const room = currentRoom();
    if (!room || !playerId) return;
    const seat = rooms.seatOf(room, playerId);
    if (seat === null) return;
    const snapshot = snapshotFor(room, seat);
    if (snapshot) socket.emit('matchStart', snapshot);
  });

  socket.on('disconnect', () => {
    if (!playerId) return;

    // A dropped phone's old socket can linger for the whole ping timeout, so
    // this can fire *after* the replacement socket has already reclaimed the
    // seat. Touch nothing unless we are still the current socket for it.
    const stillCurrent = identities.get(playerId)?.socketId === socket.id;
    dequeue(playerId);

    const room = rooms.roomOf(playerId);
    if (!room) {
      if (stillCurrent) identities.delete(playerId);
      return;
    }

    const seat = rooms.seatOf(room, playerId);
    if (seat === null) return;

    // The seat is held open for the grace period rather than freed, so a phone
    // that switched from wifi to cellular finds its match still waiting.
    const held = room.seats[seat];
    if (held && held.socketId === socket.id) {
      held.socketId = null;
      if (room.state && !isOver(room.state)) {
        held.awayUntil = Date.now() + room.state.config.reconnectGraceMs;
        seatSocket(room.seats[other(seat)])?.emit('opponentAway', held.awayUntil);
      } else {
        held.awayUntil = Date.now() + 60_000;
      }
    }
  });
});

// ----------------------------------------------------------------- game tick

/**
 * One timer drives every deadline in the process: pick timeouts, reconnect
 * grace, and room cleanup. Per-room `setTimeout`s would be a leak waiting to
 * happen every time a room ended by a path that forgot to clear them.
 */
function runTick(now: number): void {
  for (const room of rooms.all()) {
    // Pick timer.
    if (room.state && !isOver(room.state) && room.turnDeadline !== null && now >= room.turnDeadline) {
      try {
        const turn = room.state.turn;
        const { events, finished } = advance(room, turn, { type: 'timeout' });
        pushUpdate(room, events);
        if (finished) void finishMatch(room).catch((e: unknown) => console.error('[tick]', e));
      } catch (error) {
        console.error('[tick] auto-pick failed:', error);
        room.turnDeadline = now + 5_000;
      }
    }

    // Reconnect grace.
    for (const index of [0, 1] as PlayerIndex[]) {
      const seat = room.seats[index];
      if (!seat || seat.socketId !== null || seat.awayUntil === null || now < seat.awayUntil) continue;

      if (room.state && !isOver(room.state) && !room.scored) {
        void finishMatch(room, index).catch((error: unknown) => console.error('[grace]', error));
      }
      seatSocket(room.seats[other(index)])?.emit('opponentLeft');
      rooms.leave(room, seat.record.id);
      identities.delete(seat.record.id);
    }

    // Sweep rooms nobody ever used.
    if (!room.state && room.createdAt + EMPTY_ROOM_TTL_MS < now) rooms.destroy(room);
  }
}

const tick = setInterval(() => {
  const now = Date.now();
  runTick(now);
}, TICK_MS);
tick.unref?.();

/**
 * Where `pnpm build` leaves the client, relative to the bundled server. The
 * bundle lands in `packages/server/dist/`, so the client's own `dist` is two
 * levels up — resolved from the module's own URL rather than `process.cwd()`,
 * because a host is free to start the process from anywhere.
 */
const DEFAULT_CLIENT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'client', 'dist');

return (async () => {
  if (options.clientDir !== false) {
    const dir = options.clientDir ?? process.env.CLIENT_DIR ?? DEFAULT_CLIENT_DIR;
    serveStatic = await createStaticHandler(dir);
    // Not fatal: an API-only deployment behind a CDN is a legitimate setup, and
    // so is `pnpm dev`, where Vite serves the client. But it is the difference
    // between a working game and a blank page, so it says which one happened.
    console.log(serveStatic ? `[delezh] serving client from ${dir}` : `[delezh] no client bundle at ${dir}, API only`);
  }

  return new Promise<RunningServer>((resolve) => {
  http.listen(PORT, () => {
    const address = http.address();
    const port = typeof address === 'object' && address ? address.port : PORT;
    console.log(`[delezh] server on :${port}`);
    resolve({
      port,
      stats: () => ({ rooms: rooms.all().length, queue: queue.length, identities: identities.size }),
      close: () =>
        new Promise<void>((done) => {
          clearInterval(tick);
          (repo as { flush?: () => void }).flush?.();
          void io.close(() => http.close(() => done()));
        }),
    });
  });
  });
})();
}
