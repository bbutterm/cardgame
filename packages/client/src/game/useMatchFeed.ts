import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameEvent, PlayerIndex, RoundResult } from '@delezh/engine';
import type { EmoteMessage } from './types.js';

/**
 * The part of a match controller that is identical for a bot game and an online
 * game: turning an event stream into a battle to animate, transient notices, and
 * a bounded emote feed.
 *
 * Extracted because the two controllers had this logic byte-for-byte twice. The
 * duplication was not expensive in lines; it was expensive in that "which events
 * are worth showing" and the two timings below existed in two places, and would
 * have drifted the first time a new `GameEvent` kind was added — leaving the bot
 * match and the online match giving different feedback for the same rule.
 *
 * What is NOT here, deliberately: the pick timer (a bot game counts locally, an
 * online game follows the server's deadline) and pick authority.
 */

const NOTICE_MS = 1800;
const EMOTE_MS = 2600;
/** Emote feed cap. A flood must not grow the DOM without bound. */
const MAX_EMOTES = 4;

/**
 * Events worth surfacing to the player as a transient chip.
 *
 * `pick` counts only when the engine made it: running out of time costs you a
 * turn, and the board said nothing at all about it.
 */
function isNotice(event: GameEvent): boolean {
  if (event.t === 'pick') return event.auto;
  return event.t === 'skip' || event.t === 'extraPick' || event.t === 'peek';
}

export interface MatchFeed {
  battle: RoundResult | null;
  dismissBattle: () => void;
  notices: GameEvent[];
  emotes: EmoteMessage[];
  /** Folds a batch of engine events into the feed. */
  ingest: (events: GameEvent[]) => void;
  pushEmote: (from: PlayerIndex, key: string) => void;
  reset: () => void;
}

export function useMatchFeed(): MatchFeed {
  const [battle, setBattle] = useState<RoundResult | null>(null);
  const [notices, setNotices] = useState<GameEvent[]>([]);
  const [emotes, setEmotes] = useState<EmoteMessage[]>([]);
  const nextEmoteId = useRef(0);

  const ingest = useCallback((events: GameEvent[]) => {
    const resolved = events.find((e): e is Extract<GameEvent, { t: 'battle' }> => e.t === 'battle');
    if (resolved) setBattle(resolved.result);
    const interesting = events.filter(isNotice);
    if (interesting.length > 0) setNotices(interesting);
  }, []);

  const pushEmote = useCallback((from: PlayerIndex, key: string) => {
    nextEmoteId.current += 1;
    const id = nextEmoteId.current;
    setEmotes((current) => [...current, { id, from, key }].slice(-MAX_EMOTES));
  }, []);

  const reset = useCallback(() => {
    setBattle(null);
    setNotices([]);
    setEmotes([]);
  }, []);

  useEffect(() => {
    if (notices.length === 0) return;
    const timer = window.setTimeout(() => setNotices([]), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notices]);

  useEffect(() => {
    if (emotes.length === 0) return;
    const timer = window.setTimeout(() => setEmotes((current) => current.slice(1)), EMOTE_MS);
    return () => window.clearTimeout(timer);
  }, [emotes]);

  return {
    battle,
    dismissBattle: useCallback(() => setBattle(null), []),
    notices,
    emotes,
    ingest,
    pushEmote,
    reset,
  };
}
