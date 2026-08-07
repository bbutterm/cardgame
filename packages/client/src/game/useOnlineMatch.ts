import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { GameEvent, MatchState, PlayerIndex, RoundResult } from '@delezh/engine';
import type {
  ClientToServer,
  MatchOver,
  MatchSnapshot,
  RoomSummary,
  ServerToClient,
} from '@delezh/protocol';
import { loadProfile, updateProfile } from '../profile.js';
import type { EmoteMessage, MatchController, MatchStatus } from './types.js';

export type OnlineStage =
  | { kind: 'connecting' }
  | { kind: 'idle' }
  | { kind: 'queued'; since: number }
  | { kind: 'room'; room: RoomSummary }
  | { kind: 'match' }
  | { kind: 'error'; message: string };

/**
 * Online match controller.
 *
 * The client holds no authority: it renders whatever snapshot the server sends
 * and forwards taps. A pick is sent optimistically only in the sense that the
 * button disables immediately — the board does not move until the server's
 * update lands, so a rejected action can never leave a phantom card on screen.
 */
export function useOnlineMatch() {
  const socketRef = useRef<Socket<ServerToClient, ClientToServer> | null>(null);
  const [stage, setStage] = useState<OnlineStage>({ kind: 'connecting' });
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [battle, setBattle] = useState<RoundResult | null>(null);
  const [notices, setNotices] = useState<GameEvent[]>([]);
  const [emotes, setEmotes] = useState<EmoteMessage[]>([]);
  const [over, setOver] = useState<MatchOver | null>(null);
  const [awayUntil, setAwayUntil] = useState<number | null>(null);
  const [rematchPending, setRematchPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const emoteId = useRef(0);

  // Single socket for the lifetime of the screen.
  useEffect(() => {
    const socket: Socket<ServerToClient, ClientToServer> = io({
      transports: ['websocket', 'polling'],
      // Socket.io's own backoff handles the phone-in-a-tunnel case; identify()
      // on reconnect is what actually reclaims the seat.
      reconnectionDelay: 400,
      reconnectionDelayMax: 4000,
    });
    socketRef.current = socket;

    const profile = loadProfile();

    const identify = () => {
      socket.emit('identify', { id: profile.id, name: profile.name }, (result) => {
        if ('ok' in result && result.ok) {
          updateProfile({ rating: result.rating });
          setStage((current) => (current.kind === 'connecting' ? { kind: 'idle' } : current));
        } else {
          setStage({ kind: 'error', message: 'error.offline' });
        }
      });
    };

    socket.on('connect', identify);
    socket.on('connect_error', () => setStage({ kind: 'error', message: 'error.offline' }));
    socket.on('disconnect', () => setStage((c) => (c.kind === 'match' ? c : { kind: 'connecting' })));

    socket.on('room', (room) => setStage({ kind: 'room', room }));

    socket.on('matchStart', (next) => {
      setSnapshot(next);
      setOver(null);
      setBattle(null);
      setRematchPending(false);
      setAwayUntil(null);
      setStage({ kind: 'match' });
    });

    socket.on('matchUpdate', (next, events) => {
      setSnapshot((current) => {
        // Snapshots can arrive out of order after a resync; seq is monotonic.
        if (current && current.matchId === next.matchId && current.state.seq > next.state.seq) return current;
        return next;
      });
      const resolved = events.find((e): e is Extract<GameEvent, { t: 'battle' }> => e.t === 'battle');
      if (resolved) setBattle(resolved.result);
      const interesting = events.filter((e) => e.t === 'skip' || e.t === 'extraPick' || e.t === 'peek');
      if (interesting.length > 0) setNotices(interesting);
    });

    socket.on('matchOver', (result) => setOver(result));
    socket.on('opponentLeft', () => setAwayUntil(null));
    socket.on('opponentAway', (until) => setAwayUntil(until));
    socket.on('opponentBack', () => setAwayUntil(null));
    socket.on('rematchOffered', () => setRematchPending(false));
    socket.on('queued', () => setStage({ kind: 'queued', since: Date.now() }));

    socket.on('emote', (from, key) => {
      emoteId.current += 1;
      setEmotes((current) => [...current, { id: emoteId.current, from, key }]);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // A one-second clock drives both the pick timer and the reconnect countdown.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (notices.length === 0) return;
    const timer = window.setTimeout(() => setNotices([]), 1800);
    return () => window.clearTimeout(timer);
  }, [notices]);

  useEffect(() => {
    if (emotes.length === 0) return;
    const timer = window.setTimeout(() => setEmotes((current) => current.slice(1)), 2600);
    return () => window.clearTimeout(timer);
  }, [emotes]);

  const createRoom = useCallback(() => {
    socketRef.current?.emit('createRoom', (result) => {
      if ('ok' in result && result.ok) setStage({ kind: 'room', room: result.room });
      else setStage({ kind: 'error', message: 'error.generic' });
    });
  }, []);

  const joinRoom = useCallback((code: string) => {
    socketRef.current?.emit('joinRoom', code.trim().toUpperCase(), (result) => {
      if ('ok' in result && result.ok) setStage({ kind: 'room', room: result.room });
      else setStage({ kind: 'error', message: result.code === 'room_full' ? 'online.roomFull' : 'online.roomNotFound' });
    });
  }, []);

  const startQueue = useCallback(() => {
    setStage({ kind: 'queued', since: Date.now() });
    socketRef.current?.emit('queue', () => undefined);
  }, []);

  const cancelQueue = useCallback(() => {
    socketRef.current?.emit('cancelQueue');
    setStage({ kind: 'idle' });
  }, []);

  const leave = useCallback(() => {
    socketRef.current?.emit('leaveRoom');
    setSnapshot(null);
    setOver(null);
    setStage({ kind: 'idle' });
  }, []);

  const state: MatchState | null = snapshot?.state ?? null;
  const me: PlayerIndex = snapshot?.seat ?? 0;

  const status: MatchStatus =
    stage.kind === 'error'
      ? 'error'
      : over || state?.phase === 'gameOver'
        ? 'over'
        : awayUntil !== null
          ? 'opponentAway'
          : stage.kind === 'match'
            ? 'playing'
            : stage.kind === 'connecting'
              ? 'connecting'
              : 'waiting';

  const myTurn = !!state && state.phase === 'draft' && state.turn === me && !battle && awayUntil === null;

  const controller = useMemo<MatchController>(
    () => ({
      state,
      me,
      status,
      canPick: myTurn,
      pick: (uid: string) => {
        if (!snapshot) return;
        socketRef.current?.emit('pick', snapshot.matchId, uid, () => undefined);
      },
      timeLeftMs: snapshot?.turnDeadline != null && myTurn ? Math.max(0, snapshot.turnDeadline - now) : null,
      battle,
      dismissBattle: () => setBattle(null),
      notices,
      emotes,
      sendEmote: (key: string) => {
        socketRef.current?.emit('emote', key);
        emoteId.current += 1;
        setEmotes((current) => [...current, { id: emoteId.current, from: me, key }]);
      },
      rematch: () => {
        setRematchPending(true);
        socketRef.current?.emit('rematch');
      },
      rematchPending,
      leave,
      ratingDelta: over?.ratingDelta ?? null,
      opponentName: snapshot?.opponent.name ?? null,
      reconnectSeconds: awayUntil !== null ? Math.max(0, Math.ceil((awayUntil - now) / 1000)) : null,
    }),
    [state, me, status, myTurn, snapshot, battle, notices, emotes, rematchPending, leave, over, awayUntil, now],
  );

  return { controller, stage, createRoom, joinRoom, startQueue, cancelQueue, leave, over };
}
