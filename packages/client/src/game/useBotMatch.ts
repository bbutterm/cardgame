import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { applyAction, createMatch, other, type GameEvent, type MatchState, type PlayerIndex, type RoundResult } from '@delezh/engine';
import { chooseCard, type BotLevel } from '@delezh/bot';
import type { EmoteMessage, MatchController, MatchStatus } from './types.js';

/** How long the bot "thinks" before picking, so its turn is legible. */
const BOT_DELAY_MS: Record<BotLevel, [number, number]> = {
  easy: [350, 700],
  normal: [500, 950],
  hard: [650, 1200],
};

/** Emotes the bot fires back occasionally, so the seat does not feel empty. */
const BOT_EMOTES = ['emote.gg', 'emote.nice', 'emote.wow', 'emote.thinking'];

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface BotMatchOptions {
  level: BotLevel;
  onFinish?: (winner: PlayerIndex | null) => void;
}

/**
 * A full match against the local bot. The engine is the same module the server
 * runs, so a bot game and an online game follow identical rules — the only
 * difference is who produces the opponent's action.
 */
export function useBotMatch({ level, onFinish }: BotMatchOptions): MatchController {
  const me: PlayerIndex = 0;
  const bot = other(me);

  const [seed, setSeed] = useState(newSeed);
  const [state, setState] = useState<MatchState | null>(null);
  const [battle, setBattle] = useState<RoundResult | null>(null);
  const [notices, setNotices] = useState<GameEvent[]>([]);
  const [emotes, setEmotes] = useState<EmoteMessage[]>([]);
  const [timeLeftMs, setTimeLeftMs] = useState<number | null>(null);

  const emoteId = useRef(0);
  const finished = useRef(false);

  // Start (or restart) the match whenever the seed changes.
  useEffect(() => {
    finished.current = false;
    const firstPicker: PlayerIndex = Math.random() < 0.5 ? me : bot;
    const created = createMatch({ seed, firstPicker });
    setState(created.state);
    setBattle(null);
    setNotices([]);
    setEmotes([]);
  }, [seed, me, bot]);

  const consume = useCallback(
    (next: MatchState, events: GameEvent[]) => {
      const resolved = events.find((e): e is Extract<GameEvent, { t: 'battle' }> => e.t === 'battle');
      const interesting = events.filter((e) => e.t === 'skip' || e.t === 'extraPick' || e.t === 'peek');

      setState(next);
      if (interesting.length > 0) setNotices(interesting);
      if (resolved) setBattle(resolved.result);
    },
    [],
  );

  const act = useCallback(
    (player: PlayerIndex, uid: string) => {
      setState((current) => {
        if (!current || current.phase !== 'draft' || current.turn !== player) return current;
        try {
          const { state: next, events } = applyAction(current, player, { type: 'pick', uid });
          // Defer the side effects out of the state updater.
          queueMicrotask(() => consume(next, events));
          return current;
        } catch {
          return current;
        }
      });
    },
    [consume],
  );

  const pick = useCallback((uid: string) => act(me, uid), [act, me]);

  // --- bot turn -----------------------------------------------------------
  useEffect(() => {
    if (!state || state.phase !== 'draft' || state.turn !== bot || battle) return;

    const [min, max] = BOT_DELAY_MS[level];
    const delay = min + Math.random() * (max - min);
    const timer = window.setTimeout(() => {
      try {
        const uid = chooseCard(state, bot, { level });
        act(bot, uid);
      } catch {
        /* the row emptied underneath us; the next effect run will settle it */
      }
      // A little personality, rarely enough not to be annoying.
      if (Math.random() < 0.12) {
        const key = BOT_EMOTES[Math.floor(Math.random() * BOT_EMOTES.length)] as string;
        emoteId.current += 1;
        setEmotes((current) => [...current, { id: emoteId.current, from: bot, key }]);
      }
    }, delay);

    return () => window.clearTimeout(timer);
  }, [state, bot, battle, level, act]);

  // --- pick timer ---------------------------------------------------------
  const myTurn = !!state && state.phase === 'draft' && state.turn === me && !battle;
  const turnId = state?.turnId ?? -1;

  useEffect(() => {
    if (!myTurn || !state) {
      setTimeLeftMs(null);
      return;
    }
    const total = state.config.pickTimeoutMs;
    const startedAt = Date.now();
    setTimeLeftMs(total);

    const tick = window.setInterval(() => {
      const left = total - (Date.now() - startedAt);
      setTimeLeftMs(Math.max(0, left));
      if (left <= 0) {
        window.clearInterval(tick);
        setState((current) => {
          if (!current || current.phase !== 'draft' || current.turn !== me) return current;
          const { state: next, events } = applyAction(current, me, { type: 'timeout' });
          queueMicrotask(() => consume(next, events));
          return current;
        });
      }
    }, 100);

    return () => window.clearInterval(tick);
    // turnId is the dependency that matters: a new turn restarts the clock.
  }, [myTurn, turnId, me, consume]);

  // --- completion ---------------------------------------------------------
  useEffect(() => {
    if (state?.phase === 'gameOver' && !battle && !finished.current) {
      finished.current = true;
      onFinish?.(state.winner);
    }
  }, [state, battle, onFinish]);

  // Notices are transient.
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

  const sendEmote = useCallback(
    (key: string) => {
      emoteId.current += 1;
      setEmotes((current) => [...current, { id: emoteId.current, from: me, key }]);
    },
    [me],
  );

  const status: MatchStatus = !state ? 'connecting' : state.phase === 'gameOver' ? 'over' : 'playing';

  return useMemo<MatchController>(
    () => ({
      state,
      me,
      status,
      canPick: myTurn,
      pick,
      timeLeftMs,
      battle,
      dismissBattle: () => setBattle(null),
      notices,
      emotes,
      sendEmote,
      rematch: () => setSeed(newSeed()),
      rematchPending: false,
      leave: () => undefined,
      ratingDelta: null,
      opponentName: null,
      reconnectSeconds: null,
    }),
    [state, me, status, myTurn, pick, timeLeftMs, battle, notices, emotes, sendEmote],
  );
}
