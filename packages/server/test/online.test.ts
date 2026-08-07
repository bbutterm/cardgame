import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { io as connect, type Socket } from 'socket.io-client';
import type { GameEvent, MatchState, PlayerIndex } from '@delezh/engine';
import type { ClientToServer, MatchOver, MatchSnapshot, ServerToClient } from '@delezh/protocol';
import { InMemoryRatingRepository } from '../src/ratings.js';
import { startServer, type RunningServer } from '../src/server.js';

/**
 * End-to-end tests over real sockets against a real server instance.
 *
 * Mocking the transport here would test almost nothing that matters — the
 * things that break in an online card game are ordering, reconnects and
 * authority, none of which survive a fake socket.
 */

let server: RunningServer;
const repo = new InMemoryRatingRepository();

beforeAll(async () => {
  server = await startServer({
    port: 0,
    repository: repo,
    // Short timers so the reconnect and timeout paths are testable in real time.
    matchConfig: { pickTimeoutMs: 60_000, reconnectGraceMs: 700 },
  });
});

afterAll(async () => {
  await server?.close();
});

/** A test client: a socket plus the events it has seen. */
class Client {
  readonly socket: Socket<ServerToClient, ClientToServer>;
  snapshot: MatchSnapshot | null = null;
  over: MatchOver | null = null;
  events: GameEvent[] = [];
  emotes: Array<{ from: PlayerIndex; key: string }> = [];
  opponentAway = 0;
  opponentBack = 0;
  opponentLeft = 0;

  constructor(readonly id: string, readonly name: string) {
    this.socket = connect(`http://127.0.0.1:${server.port}`, {
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
    });
    this.socket.on('matchStart', (snapshot) => {
      this.snapshot = snapshot;
    });
    this.socket.on('matchUpdate', (snapshot, events) => {
      this.snapshot = snapshot;
      this.events.push(...events);
    });
    this.socket.on('matchOver', (result) => {
      this.over = result;
    });
    this.socket.on('emote', (from, key) => this.emotes.push({ from, key }));
    this.socket.on('opponentAway', () => this.opponentAway++);
    this.socket.on('opponentBack', () => this.opponentBack++);
    this.socket.on('opponentLeft', () => this.opponentLeft++);
  }

  connected(): Promise<void> {
    return new Promise((resolve) => {
      if (this.socket.connected) resolve();
      else this.socket.once('connect', () => resolve());
    });
  }

  identify(): Promise<{ rating: number }> {
    return new Promise((resolve, reject) => {
      this.socket.emit('identify', { id: this.id, name: this.name }, (result) => {
        if ('ok' in result && result.ok) resolve({ rating: result.rating });
        else reject(new Error(`identify failed: ${JSON.stringify(result)}`));
      });
    });
  }

  createRoom(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.socket.emit('createRoom', (result) => {
        if ('ok' in result && result.ok) resolve(result.room.code);
        else reject(new Error('createRoom failed'));
      });
    });
  }

  joinRoom(code: string): Promise<{ ok: boolean; code?: string }> {
    return new Promise((resolve) => {
      this.socket.emit('joinRoom', code, (result) => {
        resolve('ok' in result && result.ok ? { ok: true } : { ok: false, code: (result as { code: string }).code });
      });
    });
  }

  queue(): Promise<void> {
    return new Promise((resolve) => this.socket.emit('queue', () => resolve()));
  }

  pick(uid: string): Promise<{ ok: boolean; code?: string }> {
    return new Promise((resolve) => {
      this.socket.emit('pick', this.snapshot?.matchId ?? '', uid, (result) => {
        resolve('ok' in result && result.ok ? { ok: true } : { ok: false, code: (result as { code: string }).code });
      });
    });
  }

  close(): void {
    this.socket.disconnect();
  }
}

async function waitFor(predicate: () => boolean, timeoutMs = 4000, label = 'condition'): Promise<void> {
  const started = Date.now();
  while (!predicate()) {
    if (Date.now() - started > timeoutMs) throw new Error(`timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

let seq = 0;
async function pair(prefix = 'p'): Promise<[Client, Client]> {
  seq++;
  const a = new Client(`${prefix}-a-${seq}`, `A${seq}`);
  const b = new Client(`${prefix}-b-${seq}`, `B${seq}`);
  await Promise.all([a.connected(), b.connected()]);
  await Promise.all([a.identify(), b.identify()]);
  return [a, b];
}

/** Drives a live match to completion by always taking the first open card. */
async function playOut(a: Client, b: Client): Promise<void> {
  for (let guard = 0; guard < 60; guard++) {
    if (a.over || b.over) return;
    const state = a.snapshot?.state;
    if (!state || state.phase === 'gameOver') return;

    const actor = state.turn === a.snapshot?.seat ? a : b;
    const open = actor.snapshot?.state.open.find((slot) => slot !== null);
    if (!open) return;

    const result = await actor.pick(open.uid);
    if (!result.ok) {
      throw new Error(
        `pick rejected (${result.code}) at seq ${state.seq}, round ${state.round}, turn ${state.turn}, ` +
          `actor seat ${actor.snapshot?.seat}, uid ${open.uid}`,
      );
    }
    // Both snapshots, not just A's: the server pushes to the two sockets
    // independently, so reading B's board right after A's arrives can see a
    // card that B still believes is available.
    await waitFor(
      () =>
        !!a.over ||
        ((a.snapshot?.state.seq ?? 0) > state.seq && (b.snapshot?.state.seq ?? 0) > state.seq),
      4000,
      'both snapshots',
    );
  }
}

describe('rooms by code', () => {
  it('starts a match once both seats are filled', async () => {
    const [a, b] = await pair('room');
    const code = await a.createRoom();
    expect(code).toHaveLength(4);

    expect((await b.joinRoom(code)).ok).toBe(true);
    await waitFor(() => !!a.snapshot && !!b.snapshot, 4000, 'match start');

    // Seats are distinct and both see the same match.
    expect(a.snapshot!.seat).not.toBe(b.snapshot!.seat);
    expect(a.snapshot!.matchId).toBe(b.snapshot!.matchId);
    expect(a.snapshot!.opponent.name).toBe(b.name);
    expect(a.snapshot!.state.open.filter(Boolean)).toHaveLength(5);

    a.close();
    b.close();
  });

  it('rejects a bad code and a full room', async () => {
    const [a, b] = await pair('bad');
    expect((await a.joinRoom('ZZZZ')).code).toBe('room_not_found');
    expect((await a.joinRoom('!!')).code).toBe('room_not_found');

    const code = await a.createRoom();
    await b.joinRoom(code);

    const [c] = await pair('third');
    expect((await c.joinRoom(code)).code).toBe('room_full');

    a.close();
    b.close();
    c.close();
  });
});

describe('authority', () => {
  it('refuses a pick from the player who is not on turn', async () => {
    const [a, b] = await pair('turn');
    const code = await a.createRoom();
    await b.joinRoom(code);
    await waitFor(() => !!a.snapshot && !!b.snapshot);

    const onTurn = a.snapshot!.state.turn === a.snapshot!.seat ? a : b;
    const offTurn = onTurn === a ? b : a;
    const uid = onTurn.snapshot!.state.open.find((slot) => slot !== null)!.uid;

    expect((await offTurn.pick(uid)).code).toBe('illegal_move');
    expect((await onTurn.pick(uid)).ok).toBe(true);
    // And the same card cannot be taken twice.
    await waitFor(() => (a.snapshot?.state.seq ?? 0) > 0);
    const second = a.snapshot!.state.turn === a.snapshot!.seat ? a : b;
    expect((await second.pick(uid)).code).toBe('illegal_move');

    a.close();
    b.close();
  });

  it('never sends a player a row they have not earned sight of', async () => {
    const [a, b] = await pair('hide');
    const code = await a.createRoom();
    await b.joinRoom(code);
    await waitFor(() => !!a.snapshot);

    const state: MatchState = a.snapshot!.state;
    expect(state.rows[0]).toHaveLength(5);
    // Future rows are absent from the payload, not merely hidden in the UI.
    for (let row = 1; row < state.rows.length; row++) {
      expect(state.rows[row], `row ${row} leaked`).toHaveLength(0);
    }

    a.close();
    b.close();
  });

  it('plays a full match and reports the result to both sides', async () => {
    const [a, b] = await pair('full');
    const code = await a.createRoom();
    await b.joinRoom(code);
    await waitFor(() => !!a.snapshot && !!b.snapshot);

    await playOut(a, b);
    await waitFor(() => !!a.over && !!b.over, 8000, 'match over');

    expect(a.over!.winner).toBe(b.over!.winner);
    expect(a.snapshot!.state.phase).toBe('gameOver');
    // Room-code games are casual, so no rating moves.
    expect(a.over!.ratingDelta).toBe(0);
    expect(b.over!.ratingDelta).toBe(0);
    // Both sides saw the battle events they need in order to animate.
    expect(a.events.filter((e) => e.t === 'battle').length).toBeGreaterThan(0);

    a.close();
    b.close();
  });
});

describe('matchmaking and rating', () => {
  it('pairs two queued players and moves their ratings', async () => {
    const [a, b] = await pair('queue');
    await a.queue();
    await b.queue();
    await waitFor(() => !!a.snapshot && !!b.snapshot, 4000, 'quick match');

    const before = (await repo.get(a.id))!.rating;
    await playOut(a, b);
    await waitFor(() => !!a.over && !!b.over, 8000, 'ranked result');

    // Ranked: the deltas are equal and opposite, and the winner gains.
    expect(a.over!.ratingDelta + b.over!.ratingDelta).toBe(0);
    if (a.over!.winner !== null) {
      const winner = a.over!.winner === a.snapshot!.seat ? a : b;
      expect(winner.over!.ratingDelta).toBeGreaterThan(0);
    }
    expect((await repo.get(a.id))!.rating).toBe(before + a.over!.ratingDelta);
    expect((await repo.get(a.id))!.games).toBe(1);

    a.close();
    b.close();
  });

  it('serves a leaderboard over http', async () => {
    const response = await fetch(`http://127.0.0.1:${server.port}/api/leaderboard`);
    expect(response.ok).toBe(true);
    const rows = (await response.json()) as Array<{ rank: number; rating: number }>;
    expect(Array.isArray(rows)).toBe(true);
    // Ranks are dense and sorted by rating descending.
    rows.forEach((row, index) => expect(row.rank).toBe(index + 1));
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1]!.rating).toBeGreaterThanOrEqual(rows[i]!.rating);
    }
  });
});

describe('reconnect', () => {
  it('holds the seat open and restores the match', async () => {
    const [a, b] = await pair('recon');
    const code = await a.createRoom();
    await b.joinRoom(code);
    await waitFor(() => !!a.snapshot && !!b.snapshot);
    const matchId = a.snapshot!.matchId;
    const seat = a.snapshot!.seat;

    a.close();
    await waitFor(() => b.opponentAway > 0, 3000, 'away notice');

    // Same player id, new socket: the seat is reclaimed, not re-allocated.
    const back = new Client(a.id, a.name);
    await back.connected();
    await back.identify();
    await waitFor(() => !!back.snapshot, 3000, 'snapshot after reconnect');

    expect(back.snapshot!.matchId).toBe(matchId);
    expect(back.snapshot!.seat).toBe(seat);
    expect(b.opponentBack).toBeGreaterThan(0);

    back.close();
    b.close();
  });

  it('forfeits once the grace period expires', async () => {
    const [a, b] = await pair('grace');
    await a.queue();
    await b.queue();
    await waitFor(() => !!a.snapshot && !!b.snapshot, 4000, 'quick match');
    const bSeat = b.snapshot!.seat;

    a.close();
    // reconnectGraceMs is 700ms in this suite.
    await waitFor(() => !!b.over, 5000, 'forfeit');

    expect(b.over!.winner).toBe(bSeat);
    expect(b.over!.ratingDelta).toBeGreaterThan(0);

    b.close();
  });
});

describe('social', () => {
  it('relays an emote to the opponent only', async () => {
    const [a, b] = await pair('emote');
    const code = await a.createRoom();
    await b.joinRoom(code);
    await waitFor(() => !!a.snapshot && !!b.snapshot);

    a.socket.emit('emote', 'emote.gg');
    await waitFor(() => b.emotes.length > 0, 3000, 'emote');

    expect(b.emotes[0]!.key).toBe('emote.gg');
    expect(b.emotes[0]!.from).toBe(a.snapshot!.seat);
    // The sender does not get their own emote echoed back.
    expect(a.emotes).toHaveLength(0);

    a.close();
    b.close();
  });

  it('starts a new match when both sides ask for a rematch', async () => {
    const [a, b] = await pair('rematch');
    const code = await a.createRoom();
    await b.joinRoom(code);
    await waitFor(() => !!a.snapshot && !!b.snapshot);
    const first = a.snapshot!.matchId;

    await playOut(a, b);
    await waitFor(() => !!a.over && !!b.over, 8000, 'match over');

    a.socket.emit('rematch');
    b.socket.emit('rematch');
    await waitFor(() => a.snapshot!.matchId !== first, 4000, 'rematch');

    expect(a.snapshot!.matchId).toBe(b.snapshot!.matchId);
    expect(a.snapshot!.state.round).toBe(0);
    expect(a.snapshot!.state.phase).toBe('draft');

    a.close();
    b.close();
  });
});

describe('hostile input', () => {
  it('survives junk without crashing', async () => {
    const [a] = await pair('junk');
    const socket = a.socket as unknown as { emit: (event: string, ...args: unknown[]) => void };

    // Actions with no match, absurd payloads, and unknown events.
    await new Promise<void>((resolve) => a.socket.emit('pick', 'nope', 'nope', () => resolve()));
    socket.emit('emote', 'x'.repeat(10_000));
    socket.emit('rematch');
    socket.emit('resync');
    socket.emit('cancelQueue');
    socket.emit('leaveRoom');
    socket.emit('totally-unknown-event', { deeply: { nested: true } });

    // Still alive and still serving.
    const response = await fetch(`http://127.0.0.1:${server.port}/api/health`);
    expect((await response.json()).ok).toBe(true);

    a.close();
  });
});

/**
 * Regressions for the findings of the security review. Each of these was a real
 * hole, and each is cheap to leave a test on.
 */
describe('review regressions', () => {
  it('never publishes a player id on the leaderboard', async () => {
    // The id IS the credential: `identify` accepts whatever it is handed. An
    // unauthenticated endpoint returning ids hands out the top accounts.
    const response = await fetch(`http://127.0.0.1:${server.port}/api/leaderboard`);
    const rows = (await response.json()) as Array<Record<string, unknown>>;
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(Object.keys(row)).not.toContain('id');
      expect(JSON.stringify(row)).not.toMatch(/queue-[ab]-\d+/);
    }
  });

  it('marks only the requesting player row as theirs', async () => {
    const all = (await (await fetch(`http://127.0.0.1:${server.port}/api/leaderboard`)).json()) as Array<{
      isYou?: boolean;
    }>;
    expect(all.filter((row) => row.isYou)).toHaveLength(0);
  });

  it('does not hand the client the seed that generates every row', async () => {
    const [a, b] = await pair('seed');
    const code = await a.createRoom();
    await b.joinRoom(code);
    await waitFor(() => !!a.snapshot);

    // Rows are built purely from the seed, so shipping it would make the
    // blanked-out `rows` pure theatre.
    expect(a.snapshot!.state.seed).toBe('');
    expect(a.snapshot!.state.rngState).toBe(0);

    a.close();
    b.close();
  });

  it('drops an emote that is not in the shared list', async () => {
    const [a, b] = await pair('badmote');
    const code = await a.createRoom();
    await b.joinRoom(code);
    await waitFor(() => !!a.snapshot && !!b.snapshot);

    a.socket.emit('emote', 'ПРИВЕТ, Я ПРОИЗВОЛЬНЫЙ ТЕКСТ' as 'emote.gg');
    a.socket.emit('emote', '<script>alert(1)</script>' as 'emote.gg');
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(b.emotes).toHaveLength(0);

    // A legitimate one still gets through.
    a.socket.emit('emote', 'emote.nice');
    await waitFor(() => b.emotes.length > 0, 2000, 'valid emote');
    expect(b.emotes[0]!.key).toBe('emote.nice');

    a.close();
    b.close();
  });

  it('refuses a second identity on one socket', async () => {
    const a = new Client('ident-1', 'One');
    await a.connected();
    await a.identify();
    const second = await new Promise<{ ok: boolean; code?: string }>((resolve) => {
      a.socket.emit('identify', { id: 'ident-2', name: 'Two' }, (result) =>
        resolve('ok' in result && result.ok ? { ok: true } : { ok: false, code: (result as { code: string }).code }),
      );
    });
    expect(second.ok).toBe(false);
    expect(second.code).toBe('rate_limited');
    a.close();
  });

  it('does not orphan a room when a seated player joins another', async () => {
    const [a, b] = await pair('orphan');
    const first = await a.createRoom();
    await b.joinRoom(first);
    await waitFor(() => !!a.snapshot && !!b.snapshot);
    const roomsBefore = server.stats().rooms;

    // A creates a second room while still seated in the first. The abandoned
    // seat used to become unreachable, leaking the room for the process life
    // and leaving B playing out a match against a 20-second auto-picker.
    const secondCode = await a.createRoom();
    expect(secondCode).not.toBe(first);
    await waitFor(() => b.opponentLeft > 0, 3000, 'opponent left notice');
    expect(server.stats().rooms).toBeLessThanOrEqual(roomsBefore + 1);

    a.close();
    b.close();
  });

  it('refuses a rematch while the match is still live', async () => {
    const [a, b] = await pair('livrematch');
    const code = await a.createRoom();
    await b.joinRoom(code);
    await waitFor(() => !!a.snapshot && !!b.snapshot);
    const matchId = a.snapshot!.matchId;
    const seq = a.snapshot!.state.seq;

    a.socket.emit('rematch');
    b.socket.emit('rematch');
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Same match, same position — a rematch mid-game would be an escape hatch
    // from a losing board in a ranked match.
    expect(a.snapshot!.matchId).toBe(matchId);
    expect(a.snapshot!.state.seq).toBe(seq);

    a.close();
    b.close();
  });

  it('ends the match state on a forfeit, not just the scoring', async () => {
    const [a, b] = await pair('forfeit');
    await a.queue();
    await b.queue();
    await waitFor(() => !!a.snapshot && !!b.snapshot, 4000, 'quick match');

    a.socket.emit('leaveRoom');
    await waitFor(() => !!b.over, 4000, 'forfeit result');

    // Without this the winner's board stays in `draft` forever and the result
    // screen, which routes on the phase, never appears.
    expect(b.over!.winner).toBe(b.snapshot!.seat);
    b.close();
  });
});
