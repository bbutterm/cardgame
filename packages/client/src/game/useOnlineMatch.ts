import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { MatchState, PlayerIndex } from '@delezh/engine';
import type {
  ClientToServer,
  MatchOver,
  MatchSnapshot,
  RoomSummary,
  ServerToClient,
} from '@delezh/protocol';
import { loadProfile, updateProfile } from '../profile.js';
import { useMatchFeed } from './useMatchFeed.js';
import type { MatchController, MatchStatus } from './types.js';

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
 * and forwards taps. A pick disables the button immediately, but the board does
 * not move until the server's update lands, so a rejected action can never leave
 * a phantom card on screen.
 */
export function useOnlineMatch() {
  const socketRef = useRef<Socket<ServerToClient, ClientToServer> | null>(null);
  const [stage, setStage] = useState<OnlineStage>({ kind: 'connecting' });
  const [snapshot, setSnapshot] = useState<MatchSnapshot | null>(null);
  const [over, setOver] = useState<MatchOver | null>(null);
  const [awayUntil, setAwayUntil] = useState<number | null>(null);
  const [rematchPending, setRematchPending] = useState(false);
  const [opponentWantsRematch, setOpponentWantsRematch] = useState(false);
  /** True while *this* client is offline, as opposed to the opponent. */
  const [selfOffline, setSelfOffline] = useState(false);
  const [opponentLeft, setOpponentLeft] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const feed = useMatchFeed();
  const feedRef = useRef(feed);
  feedRef.current = feed;

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
      setSelfOffline(false);
      socket.emit('identify', { id: profile.id, name: profile.name }, (result) => {
        if ('ok' in result && result.ok) {
          updateProfile({ rating: result.rating });
          setStage((current) => (current.kind === 'connecting' ? { kind: 'idle' } : current));
        } else {
          setStage({ kind: 'error', message: 'error.offline' });
        }
      });
    };

    let everConnected = false;
    socket.on('connect', () => {
      identify();
      setFlash(everConnected ? 'online.reconnected' : null);
      everConnected = true;
    });
    socket.on('connect_error', () => {
      setSelfOffline(true);
      setStage((current) => (current.kind === 'match' ? current : { kind: 'error', message: 'error.offline' }));
    });
    socket.on('disconnect', () => {
      setSelfOffline(true);
      setFlash('online.connectionLost');
    });

    socket.on('room', (room) => setStage({ kind: 'room', room }));

    socket.on('matchStart', (next) => {
      setSnapshot(next);
      setOver(null);
      setRematchPending(false);
      setOpponentWantsRematch(false);
      setAwayUntil(null);
      setOpponentLeft(false);
      feedRef.current.reset();
      setStage({ kind: 'match' });
    });

    socket.on('matchUpdate', (next, events) => {
      setSnapshot((current) => {
        // Snapshots can arrive out of order after a resync; seq is monotonic.
        if (current && current.matchId === next.matchId && current.state.seq > next.state.seq) return current;
        return next;
      });
      feedRef.current.ingest(events);
    });

    socket.on('matchOver', (result) => setOver(result));
    socket.on('opponentLeft', () => {
      setAwayUntil(null);
      setOpponentLeft(true);
      setFlash('online.opponentLeft');
    });
    socket.on('opponentAway', (until) => setAwayUntil(until));
    socket.on('opponentBack', () => setAwayUntil(null));
    // Sent to the player who did NOT ask — it is an incoming offer, not an ack.
    socket.on('rematchOffered', () => setOpponentWantsRematch(true));
    socket.on('queued', () => setStage({ kind: 'queued', since: Date.now() }));

    socket.on('emote', (from, key) => feedRef.current.pushEmote(from, key));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  const state: MatchState | null = snapshot?.state ?? null;
  const me: PlayerIndex = snapshot?.seat ?? 0;
  const finished = !!over || state?.phase === 'gameOver';

  /**
   * The clock only runs while something on screen depends on it. It used to
   * tick forever, re-rendering the whole match tree four times a second on the
   * menu and long after the match had ended.
   */
  const needsClock = (!!snapshot?.turnDeadline && !finished) || awayUntil !== null;
  useEffect(() => {
    if (!needsClock) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [needsClock]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 2400);
    return () => window.clearTimeout(timer);
  }, [flash]);

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

  const status: MatchStatus =
    stage.kind === 'error'
      ? 'error'
      : finished
        ? 'over'
        : selfOffline
          ? 'reconnecting'
          : awayUntil !== null
            ? 'opponentAway'
            : stage.kind === 'match'
              ? 'playing'
              : stage.kind === 'connecting'
                ? 'connecting'
                : 'waiting';

  const myTurn =
    !!state && state.phase === 'draft' && state.turn === me && !feed.battle && awayUntil === null && !selfOffline;

  const controller = useMemo<MatchController>(
    () => ({
      state,
      me,
      status,
      canPick: myTurn,
      pick: (uid: string) => {
        if (!snapshot) return;
        socketRef.current?.emit('pick', snapshot.matchId, uid, (result) => {
          // A rejection means this client's view drifted; the server re-syncs
          // it, but the player deserves to know the tap did nothing.
          if (!('ok' in result) || !result.ok) setFlash('error.illegalMove');
        });
      },
      /**
       * Counts down whenever the server has a deadline — including while the
       * battle overlay is up. The server's pick timer does not pause for the
       * animation, so hiding the clock during it silently burned the player's
       * next turn.
       */
      timeLeftMs: snapshot?.turnDeadline != null && !finished ? Math.max(0, snapshot.turnDeadline - now) : null,
      battle: feed.battle,
      dismissBattle: feed.dismissBattle,
      notices: feed.notices,
      emotes: feed.emotes,
      sendEmote: (key: string) => {
        socketRef.current?.emit('emote', key);
        feed.pushEmote(me, key);
      },
      rematch: () => {
        setRematchPending(true);
        socketRef.current?.emit('rematch');
      },
      rematchPending,
      opponentWantsRematch,
      opponentLeft,
      flash,
      leave,
      ratingDelta: over?.ratingDelta ?? null,
      opponentName: snapshot?.opponent.name ?? null,
      reconnectSeconds: awayUntil !== null ? Math.max(0, Math.ceil((awayUntil - now) / 1000)) : null,
    }),
    [state, me, status, myTurn, snapshot, feed, rematchPending, opponentWantsRematch, opponentLeft, flash, leave, over, awayUntil, now, finished],
  );

  return { controller, stage, createRoom, joinRoom, startQueue, cancelQueue, leave, over };
}
