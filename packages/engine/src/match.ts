import { getCard, type CardDef } from '@delezh/cards';
import { CARDS } from '@delezh/cards';
import { resolveBattle, type SideContext } from './battle.js';
import { DEFAULT_CONFIG, type MatchConfig } from './config.js';
import { buildRows } from './pool.js';
import { createRng } from './rng.js';
import {
  other,
  type Action,
  type ApplyResult,
  type CardInstance,
  type GameEvent,
  type MatchState,
  type PlayerIndex,
  type PlayerState,
} from './types.js';

export interface CreateMatchOptions {
  seed: string;
  config?: Partial<MatchConfig>;
  /** Card pool. Defaults to the base set. */
  cards?: readonly CardDef[];
  /** Who picks first in row 1. Derived from the seed when omitted. */
  firstPicker?: PlayerIndex;
  /**
   * Explicit rows as card ids, overriding the weighted draw for as many rows as
   * are supplied. Used by tests and by server-side replays of a recorded match.
   */
  rows?: string[][];
}

function emptyPlayer(hp: number): PlayerState {
  return {
    hp,
    maxHp: hp,
    row: [],
    taken: [],
    skips: 0,
    extras: 0,
    peekedRow: null,
    roundsWon: 0,
    pickedSecond: false,
    skipsUsed: 0,
  };
}

export function createMatch(options: CreateMatchOptions): ApplyResult {
  const config: MatchConfig = { ...DEFAULT_CONFIG, ...options.config };
  const pool = options.cards ?? CARDS;
  const rng = createRng(options.seed);

  const rows = buildRows(rng, pool, config.rounds, config.rowSize);
  if (options.rows) {
    options.rows.forEach((ids, row) => {
      if (row >= rows.length) return;
      if (ids.length !== config.rowSize) {
        throw new Error(`row ${row} must contain exactly ${config.rowSize} cards`);
      }
      rows[row] = ids.map((cardId, slot) => {
        getCard(cardId); // throws on a typo
        return { uid: `r${row}s${slot}`, cardId, row, slot };
      });
    });
  }
  const firstPicker: PlayerIndex = options.firstPicker ?? ((rng.int(2) === 0 ? 0 : 1) as PlayerIndex);
  const second = other(firstPicker);

  const players: [PlayerState, PlayerState] = [emptyPlayer(config.startHp), emptyPlayer(config.startHp)];
  players[second] = emptyPlayer(config.startHp + config.secondPickerHpBonus);
  players[second].pickedSecond = true;

  const state: MatchState = {
    version: 1,
    seed: options.seed,
    rngState: rng.state(),
    config,
    rows,
    round: 0,
    open: [...(rows[0] as CardInstance[])],
    firstPicker,
    turn: firstPicker,
    nextFirstPicker: null,
    players,
    phase: 'draft',
    winner: null,
    lastRound: null,
    seq: 0,
    turnId: 0,
  };

  const events: GameEvent[] = [
    { t: 'matchStart', hp: [players[0].hp, players[1].hp], firstPicker },
    { t: 'rowStart', round: 0, cards: [...(rows[0] as CardInstance[])], firstPicker },
    { t: 'turn', player: firstPicker, turnId: 0 },
  ];

  return { state, events };
}

/** Cards the given player may take right now. Empty unless it is their turn. */
export function legalPicks(state: MatchState, player: PlayerIndex): CardInstance[] {
  if (state.phase !== 'draft' || state.turn !== player) return [];
  return state.open.filter((c): c is CardInstance => c !== null);
}

/** The auto-pick used when the turn timer runs out: strongest printed number. */
export function autoPickUid(state: MatchState): string | null {
  const available = state.open.filter((c): c is CardInstance => c !== null);
  if (available.length === 0) return null;
  let best = available[0] as CardInstance;
  let bestPower = getCard(best.cardId).power;
  for (const candidate of available.slice(1)) {
    const power = getCard(candidate.cardId).power;
    if (power > bestPower) {
      best = candidate;
      bestPower = power;
    }
  }
  return best.uid;
}

export class IllegalActionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IllegalActionError';
  }
}

/**
 * The single entry point for mutating a match. Pure: the input state is never
 * modified, and the same (state, player, action) always yields the same output.
 */
export function applyAction(state: MatchState, player: PlayerIndex, action: Action): ApplyResult {
  if (state.phase === 'gameOver') throw new IllegalActionError('match is over');
  if (state.turn !== player) throw new IllegalActionError('not your turn');

  const next: MatchState = structuredClone(state);
  const events: GameEvent[] = [];

  const uid = action.type === 'timeout' ? autoPickUid(next) : action.uid;
  if (uid === null) throw new IllegalActionError('nothing to pick');

  const slot = next.open.findIndex((c) => c !== null && c.uid === uid);
  if (slot < 0) throw new IllegalActionError(`card ${uid} is not available`);

  const card = next.open[slot] as CardInstance;
  next.open[slot] = null;

  const me = next.players[player];
  me.row.push(card);
  me.taken.push(card);
  events.push({ t: 'pick', player, card, auto: action.type === 'timeout' });

  applyPickEffects(next, player, card, events);

  if (next.open.every((c) => c === null)) {
    endRow(next, events);
  } else {
    advanceTurn(next, events);
  }

  next.seq++;
  return { state: next, events };
}

/** Effects that fire the moment a card is taken, before the battle. */
function applyPickEffects(
  state: MatchState,
  player: PlayerIndex,
  instance: CardInstance,
  events: GameEvent[],
): void {
  const def = getCard(instance.cardId);
  const me = state.players[player];

  for (const effect of def.effects) {
    switch (effect.kind) {
      case 'skipNextPick':
        me.skips++;
        break;
      case 'extraPick':
        me.extras++;
        break;
      case 'firstPickerSelf':
        state.nextFirstPicker = player;
        break;
      case 'revealNextRow': {
        const target = state.round + 1;
        if (target < state.config.rounds) {
          me.peekedRow = target;
          events.push({ t: 'peek', player, round: target });
        }
        break;
      }
      default:
        break;
    }
  }
}

function setTurn(state: MatchState, player: PlayerIndex, events: GameEvent[]): void {
  let current = player;
  // Skips bounce the turn back and forth; each bounce consumes one, so this
  // always terminates even when both players are skipping.
  let guard = 0;
  while (state.players[current].skips > 0 && guard++ < 16) {
    state.players[current].skips--;
    state.players[current].skipsUsed++;
    events.push({ t: 'skip', player: current });
    current = other(current);
  }
  state.turn = current;
  state.turnId++;
  events.push({ t: 'turn', player: current, turnId: state.turnId });
}

function advanceTurn(state: MatchState, events: GameEvent[]): void {
  const current = state.turn;
  if (state.players[current].extras > 0) {
    state.players[current].extras--;
    events.push({ t: 'extraPick', player: current });
    state.turnId++;
    events.push({ t: 'turn', player: current, turnId: state.turnId });
    return;
  }
  setTurn(state, other(current), events);
}

function endRow(state: MatchState, events: GameEvent[]): void {
  events.push({ t: 'rowEnd', round: state.round });
  state.phase = 'battle';

  const sides: [SideContext, SideContext] = [contextFor(state, 0), contextFor(state, 1)];
  const result = resolveBattle(
    {
      round: state.round,
      sides,
      instances: [state.players[0].row, state.players[1].row],
      config: state.config,
    },
    [state.players[0].maxHp, state.players[1].maxHp],
  );

  state.players[0].hp = result.hpAfter[0];
  state.players[1].hp = result.hpAfter[1];
  if (result.winner !== null) state.players[result.winner].roundsWon++;
  state.lastRound = result;
  events.push({ t: 'battle', result });

  const dead = state.players[0].hp <= 0 || state.players[1].hp <= 0;
  const lastRound = state.round + 1 >= state.config.rounds;

  if (dead || lastRound) {
    state.phase = 'gameOver';
    state.winner = decideWinner(state);
    events.push({ t: 'gameOver', winner: state.winner });
    return;
  }

  startRow(state, result.winner, events);
}

function contextFor(state: MatchState, player: PlayerIndex): SideContext {
  const p = state.players[player];
  return {
    cards: p.row.map((c) => getCard(c.cardId)),
    hp: p.hp,
    pickedSecond: p.pickedSecond,
  };
}

function decideWinner(state: MatchState): PlayerIndex | null {
  const [a, b] = state.players;
  if (a.hp <= 0 && b.hp <= 0) return null;
  if (a.hp <= 0) return 1;
  if (b.hp <= 0) return 0;
  if (a.hp !== b.hp) return a.hp > b.hp ? 0 : 1;
  if (a.roundsWon !== b.roundsWon) return a.roundsWon > b.roundsWon ? 0 : 1;
  return null;
}

function startRow(state: MatchState, roundWinner: PlayerIndex | null, events: GameEvent[]): void {
  state.round++;
  state.phase = 'draft';
  state.open = [...(state.rows[state.round] as CardInstance[])];

  const first = nextFirstPicker(state, roundWinner);
  state.firstPicker = first;
  state.nextFirstPicker = null;

  for (const index of [0, 1] as PlayerIndex[]) {
    const p = state.players[index];
    p.row = [];
    p.pickedSecond = index !== first;
  }

  events.push({ t: 'rowStart', round: state.round, cards: [...state.open.filter((c): c is CardInstance => c !== null)], firstPicker: first });
  setTurn(state, first, events);
}

function nextFirstPicker(state: MatchState, roundWinner: PlayerIndex | null): PlayerIndex {
  if (state.nextFirstPicker !== null) return state.nextFirstPicker;
  switch (state.config.firstPickerRule) {
    case 'fixed':
      return state.firstPicker;
    case 'loser':
      return roundWinner === null ? other(state.firstPicker) : other(roundWinner);
    case 'alternate':
    default:
      return other(state.firstPicker);
  }
}

/**
 * The slice of state a given player is allowed to see. Future rows are hidden
 * unless that player peeked at them; the opponent's peek state is never sent.
 *
 * The seed is redacted, and that is not cosmetic. Every row is generated purely
 * from it, so a client holding the seed can call `createMatch` and read the
 * whole match — blanking `rows` while shipping `seed` hides nothing at all and
 * makes Seer worthless. `rngState` goes for the same reason.
 */
export function viewFor(state: MatchState, player: PlayerIndex): MatchState {
  const view: MatchState = structuredClone(state);
  const me = view.players[player];
  view.rows = view.rows.map((row, index) => {
    if (index <= view.round) return row;
    if (me.peekedRow !== null && index <= me.peekedRow) return row;
    return [];
  });
  view.players[other(player)].peekedRow = null;
  view.seed = REDACTED_SEED;
  view.rngState = 0;
  return view;
}

/** Placeholder left in a redacted view so the shape stays a valid MatchState. */
export const REDACTED_SEED = '';

/** True when the match cannot continue. */
export function isOver(state: MatchState): boolean {
  return state.phase === 'gameOver';
}
