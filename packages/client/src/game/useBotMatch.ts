import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyAction,
  createMatch,
  other,
  type MatchConfig,
  type MatchState,
  type PlayerIndex,
} from '@delezh/engine';
import type { CardDef } from '@delezh/cards';
import { chooseCard, type BotLevel } from '@delezh/bot';
import { EMOTE_KEYS } from '@delezh/protocol';
import { useMatchFeed } from './useMatchFeed.js';
import type { MatchController, MatchStatus } from './types.js';

/** How long the bot "thinks" before picking, so its turn is legible. */
const BOT_DELAY_MS: Record<BotLevel, [number, number]> = {
  easy: [350, 700],
  normal: [500, 950],
  hard: [650, 1200],
};

/** Emotes the bot fires back occasionally, so the seat does not feel empty. */
const BOT_EMOTES = ['emote.gg', 'emote.nice', 'emote.wow', 'emote.thinking'] as const;

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export interface BotMatchOptions {
  level: BotLevel;
  /** Card pool. Defaults to the base set, which is what a free match uses. */
  cards?: readonly CardDef[];
  config?: Partial<MatchConfig>;
  /** Starting HP as [you, bot]. Campaign encounters use it for a handicap. */
  hp?: [number, number];
  /**
   * Fixed seat, so a handicap lands on the right player. A free match randomises
   * who picks first; a campaign encounter still does, but the HP array is
   * written from the human's point of view either way.
   */
}

/**
 * A full match against the local bot. The engine is the same module the server
 * runs, so a bot game and an online game follow identical rules — the only
 * difference is who produces the opponent's action.
 */
export function useBotMatch({ level, cards, config, hp }: BotMatchOptions): MatchController {
  const me: PlayerIndex = 0;
  const bot = other(me);

  const [seed, setSeed] = useState(newSeed);
  const [state, setState] = useState<MatchState | null>(null);
  const [timeLeftMs, setTimeLeftMs] = useState<number | null>(null);

  const feed = useMatchFeed();
  const feedRef = useRef(feed);
  feedRef.current = feed;

  /**
   * Mirrors `state` so the action path can read the freshest board without
   * doing work inside a setState updater. That earlier shape queued a
   * microtask from inside the updater, which StrictMode double-invokes — it
   * happened to be harmless because `applyAction` is pure, but it is exactly
   * the impurity the double-invocation exists to catch, and it would have
   * broken silently the first time a sound or an analytics call was added.
   */
  const stateRef = useRef<MatchState | null>(null);

  useEffect(() => {
    const firstPicker: PlayerIndex = Math.random() < 0.5 ? me : bot;
    // `hp` is written [you, bot]; seat 0 is always the human here, so it maps
    // straight across and stays correct whoever picks first.
    const created = createMatch({ seed, firstPicker, cards, config, hp });
    stateRef.current = created.state;
    setState(created.state);
    feedRef.current.reset();
  }, [seed, me, bot, cards, config, hp]);

  const act = useCallback(
    (player: PlayerIndex, action: { type: 'pick'; uid: string } | { type: 'timeout' }) => {
      const current = stateRef.current;
      if (!current || current.phase !== 'draft' || current.turn !== player) return;
      try {
        const { state: next, events } = applyAction(current, player, action);
        stateRef.current = next;
        setState(next);
        feedRef.current.ingest(events);
      } catch {
        /* the board moved underneath this tap; the next render settles it */
      }
    },
    [],
  );

  const pick = useCallback((uid: string) => act(me, { type: 'pick', uid }), [act, me]);

  // --- bot turn -----------------------------------------------------------
  useEffect(() => {
    if (!state || state.phase !== 'draft' || state.turn !== bot || feed.battle) return;

    const [min, max] = BOT_DELAY_MS[level];
    const timer = window.setTimeout(
      () => {
        const current = stateRef.current;
        if (!current || current.turn !== bot) return;
        act(bot, { type: 'pick', uid: chooseCard(current, bot, { level }) });
        // A little personality, rarely enough not to be annoying.
        if (Math.random() < 0.12) {
          const key = BOT_EMOTES[Math.floor(Math.random() * BOT_EMOTES.length)] ?? BOT_EMOTES[0];
          feedRef.current.pushEmote(bot, key);
        }
      },
      min + Math.random() * (max - min),
    );

    return () => window.clearTimeout(timer);
  }, [state, bot, feed.battle, level, act]);

  // --- pick timer ---------------------------------------------------------
  const myTurn = !!state && state.phase === 'draft' && state.turn === me && !feed.battle;
  const turnId = state?.turnId ?? -1;
  const timeoutMs = state?.config.pickTimeoutMs ?? 0;

  useEffect(() => {
    if (!myTurn) {
      setTimeLeftMs(null);
      return;
    }
    const startedAt = Date.now();
    setTimeLeftMs(timeoutMs);

    const tick = window.setInterval(() => {
      const left = timeoutMs - (Date.now() - startedAt);
      setTimeLeftMs(Math.max(0, left));
      if (left <= 0) {
        window.clearInterval(tick);
        act(me, { type: 'timeout' });
      }
    }, 100);

    return () => window.clearInterval(tick);
    // turnId is the dependency that matters: a new turn restarts the clock.
  }, [myTurn, turnId, timeoutMs, me, act]);

  const status: MatchStatus = !state ? 'connecting' : state.phase === 'gameOver' ? 'over' : 'playing';

  return useMemo<MatchController>(
    () => ({
      state,
      me,
      status,
      canPick: myTurn,
      pick,
      timeLeftMs,
      battle: feed.battle,
      dismissBattle: feed.dismissBattle,
      notices: feed.notices,
      emotes: feed.emotes,
      sendEmote: (key: string) => {
        feed.pushEmote(me, key);
        // The bot answers a "rematch?" nudge with the only thing it can say.
        if (key === EMOTE_KEYS[0]) window.setTimeout(() => feedRef.current.pushEmote(bot, 'emote.gg'), 900);
      },
      rematch: () => setSeed(newSeed()),
      rematchPending: false,
      opponentWantsRematch: false,
      opponentLeft: false,
      flash: null,
      leave: () => undefined,
      ratingDelta: null,
      opponentName: null,
      reconnectSeconds: null,
    }),
    [state, me, bot, status, myTurn, pick, timeLeftMs, feed],
  );
}
