import { describe, expect, it } from 'vitest';
import {
  applyAction,
  createMatch,
  IllegalActionError,
  legalPicks,
  other,
  viewFor,
  type ApplyResult,
  type GameEvent,
  type MatchState,
  type PlayerIndex,
} from '../src/index.js';

/** Picks the named card out of the open row for whoever is on turn. */
function take(state: MatchState, cardId: string): ApplyResult {
  const card = state.open.find((c) => c !== null && c.cardId === cardId);
  if (!card) throw new Error(`${cardId} is not in the open row: ${state.open.map((c) => c?.cardId).join(', ')}`);
  return applyAction(state, state.turn, { type: 'pick', uid: card.uid });
}

/** Takes anything available, for filling a row out. */
function takeAny(state: MatchState): ApplyResult {
  const options = legalPicks(state, state.turn);
  const first = options[0];
  if (!first) throw new Error('nothing to take');
  return applyAction(state, state.turn, { type: 'pick', uid: first.uid });
}

const FILLERS = ['wanderer', 'ember', 'cog', 'shade', 'wolf-pup'];

/**
 * Builds a match whose first row is exactly `extra` plus vanilla fillers, so
 * the card under test is guaranteed to be on the table.
 */
function start(extra: string[] = [], config: Record<string, unknown> = {}) {
  const rowSize = (config.rowSize as number | undefined) ?? 5;
  const row = [...extra, ...FILLERS].slice(0, rowSize);
  return createMatch({ seed: 'test-seed', firstPicker: 0, rows: [row], config });
}

describe('match setup', () => {
  it('is deterministic for a given seed', () => {
    const a = createMatch({ seed: 'abc', firstPicker: 0 });
    const b = createMatch({ seed: 'abc', firstPicker: 0 });
    expect(a.state.rows).toEqual(b.state.rows);
    expect(createMatch({ seed: 'xyz', firstPicker: 0 }).state.rows).not.toEqual(a.state.rows);
  });

  it('deals every row up front', () => {
    const { state } = createMatch({ seed: 'abc', firstPicker: 0 });
    expect(state.rows).toHaveLength(state.config.rounds);
    for (const row of state.rows) expect(row).toHaveLength(state.config.rowSize);
  });

  it('never repeats a card inside one row', () => {
    for (let i = 0; i < 50; i++) {
      const { state } = createMatch({ seed: `seed-${i}`, firstPicker: 0 });
      for (const row of state.rows) {
        expect(new Set(row.map((c) => c.cardId)).size).toBe(row.length);
      }
    }
  });

  it('compensates the second picker with hp', () => {
    const { state } = createMatch({ seed: 'abc', firstPicker: 0 });
    expect(state.players[0].hp).toBe(state.config.startHp);
    expect(state.players[1].hp).toBe(state.config.startHp + state.config.secondPickerHpBonus);
    expect(state.players[1].pickedSecond).toBe(true);
  });
});

describe('draft turn order', () => {
  it('alternates and splits a five card row three-two', () => {
    let { state } = start();
    const order: PlayerIndex[] = [];
    while (state.round === 0 && state.phase === 'draft') {
      order.push(state.turn);
      state = takeAny(state).state;
    }
    expect(order).toEqual([0, 1, 0, 1, 0]);
    expect(state.players[0].taken).toHaveLength(3);
    expect(state.players[1].taken).toHaveLength(2);
  });

  it('swaps the first picker between rows under the alternate rule', () => {
    let { state } = start();
    expect(state.firstPicker).toBe(0);
    while (state.round === 0) state = takeAny(state).state;
    expect(state.round).toBe(1);
    expect(state.firstPicker).toBe(1);
    expect(state.turn).toBe(1);
    expect(state.players[0].pickedSecond).toBe(true);
  });

  it('gives the first pick to the previous round loser under the loser rule', () => {
    let { state } = start([], { firstPickerRule: 'loser' });
    while (state.round === 0) state = takeAny(state).state;
    const loser = other(state.lastRound?.winner ?? 0);
    if (state.lastRound?.winner !== null) expect(state.firstPicker).toBe(loser);
  });

  it('keeps the first picker under the fixed rule', () => {
    let { state } = start([], { firstPickerRule: 'fixed' });
    while (state.round === 0) state = takeAny(state).state;
    expect(state.firstPicker).toBe(0);
  });
});

describe('skipNextPick', () => {
  it('hands the next pick to the opponent', () => {
    let { state } = start(['warlord']);
    expect(state.turn).toBe(0);

    const first = take(state, 'warlord');
    state = first.state;
    expect(state.players[0].skips).toBe(1);
    expect(state.turn).toBe(1);

    const second = takeAny(state);
    state = second.state;
    // Player 0's turn was consumed by the skip, so player 1 picks twice.
    expect(state.turn).toBe(1);
    expect(second.events.some((e: GameEvent) => e.t === 'skip')).toBe(true);
    expect(state.players[0].skips).toBe(0);
    expect(state.players[0].skipsUsed).toBe(1);
  });

  it('costs the taker a card over the row', () => {
    let { state } = start(['warlord']);
    state = take(state, 'warlord').state;
    while (state.round === 0) state = takeAny(state).state;
    expect(state.players[0].taken).toHaveLength(2);
    expect(state.players[1].taken).toHaveLength(3);
  });

  it('carries over into the next row when taken last', () => {
    let { state } = start(['warlord']);
    // Fill the row leaving Warlord for the final pick.
    while (state.open.filter((c) => c !== null).length > 1) {
      const notWarlord = state.open.find((c) => c !== null && c.cardId !== 'warlord');
      if (!notWarlord) break;
      state = applyAction(state, state.turn, { type: 'pick', uid: notWarlord.uid }).state;
    }
    const lastPicker = state.turn;
    state = take(state, 'warlord').state;
    expect(state.round).toBe(1);
    // The debt survives the row change: it is still owed at the start of row 2.
    expect(state.players[lastPicker].skips).toBe(1);
    expect(state.turn).toBe(other(lastPicker));

    // ...and is paid the first time the turn comes back around.
    state = takeAny(state).state;
    expect(state.turn).toBe(other(lastPicker));
    expect(state.players[lastPicker].skips).toBe(0);
    expect(state.players[lastPicker].skipsUsed).toBe(1);
  });

  it('resolves cleanly when both players are skipping', () => {
    let { state } = start(['warlord', 'void-titan']);
    state = take(state, 'warlord').state;
    expect(state.turn).toBe(1);
    const both = take(state, 'void-titan');
    state = both.state;
    // Player 0 skips, then player 1 skips, so both debts clear at once and the
    // turn lands back on player 0 exactly as if neither card had been taken.
    expect(both.events.filter((e: GameEvent) => e.t === 'skip')).toHaveLength(2);
    expect(state.players[0].skips).toBe(0);
    expect(state.players[1].skips).toBe(0);
    expect(state.players[0].skipsUsed).toBe(1);
    expect(state.players[1].skipsUsed).toBe(1);
    expect(state.turn).toBe(0);
  });
});

describe('extraPick', () => {
  it('lets the taker pick again immediately', () => {
    let { state } = start(['quickstep']);
    const result = take(state, 'quickstep');
    state = result.state;
    expect(result.events.some((e: GameEvent) => e.t === 'extraPick')).toBe(true);
    expect(state.turn).toBe(0);
    expect(state.players[0].row).toHaveLength(1);

    state = takeAny(state).state;
    expect(state.players[0].row).toHaveLength(2);
    expect(state.turn).toBe(1);
  });

  it('flips the three-two split when the second picker takes it', () => {
    let { state } = start(['quickstep']);
    // Player 0 takes something else first so Quickstep is left for player 1.
    const notQuickstep = state.open.find((c) => c !== null && c.cardId !== 'quickstep');
    state = applyAction(state, 0, { type: 'pick', uid: notQuickstep!.uid }).state;
    state = take(state, 'quickstep').state;
    while (state.round === 0) state = takeAny(state).state;
    expect(state.players[1].taken).toHaveLength(3);
    expect(state.players[0].taken).toHaveLength(2);
  });
});

describe('firstPickerSelf', () => {
  it('overrides the alternate rule for the next row', () => {
    let { state } = start(['herald']);
    expect(state.turn).toBe(0);
    state = take(state, 'herald').state;
    expect(state.nextFirstPicker).toBe(0);

    while (state.round === 0) state = takeAny(state).state;
    expect(state.round).toBe(1);
    expect(state.firstPicker).toBe(0);
    expect(state.nextFirstPicker).toBeNull();
  });
});

describe('revealNextRow', () => {
  it('marks the next row as peeked for the taker only', () => {
    let { state } = start(['seer']);
    const result = take(state, 'seer');
    state = result.state;

    expect(state.players[0].peekedRow).toBe(1);
    expect(state.players[1].peekedRow).toBeNull();
    expect(result.events.some((e: GameEvent) => e.t === 'peek')).toBe(true);

    const mine = viewFor(state, 0);
    const theirs = viewFor(state, 1);
    expect(mine.rows[1]).toHaveLength(state.config.rowSize);
    expect(theirs.rows[1]).toHaveLength(0);
  });

  it('does nothing in the final row', () => {
    let { state } = start(['seer'], { rounds: 1 });
    state = take(state, 'seer').state;
    expect(state.players[0].peekedRow).toBeNull();
  });
});

describe('views', () => {
  it('hides future rows and the opponent peek state', () => {
    const { state } = createMatch({ seed: 'abc', firstPicker: 0 });
    const view = viewFor(state, 0);
    expect(view.rows[0]).toHaveLength(state.config.rowSize);
    for (let i = 1; i < view.rows.length; i++) expect(view.rows[i]).toHaveLength(0);
  });
});

describe('illegal actions', () => {
  it('rejects a pick from the player not on turn', () => {
    const { state } = start();
    const uid = state.open[0]!.uid;
    expect(() => applyAction(state, 1, { type: 'pick', uid })).toThrow(IllegalActionError);
  });

  it('rejects an unknown or already taken card', () => {
    let { state } = start();
    const uid = state.open[0]!.uid;
    state = applyAction(state, 0, { type: 'pick', uid }).state;
    expect(() => applyAction(state, state.turn, { type: 'pick', uid })).toThrow(IllegalActionError);
    expect(() => applyAction(state, state.turn, { type: 'pick', uid: 'nope' })).toThrow(IllegalActionError);
  });

  it('rejects any action once the match is over', () => {
    let { state } = start();
    while (state.phase !== 'gameOver') state = takeAny(state).state;
    expect(() => applyAction(state, state.turn, { type: 'timeout' })).toThrow(IllegalActionError);
  });

  it('does not mutate the state it was given', () => {
    const { state } = start();
    const snapshot = JSON.stringify(state);
    applyAction(state, 0, { type: 'pick', uid: state.open[0]!.uid });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe('timeout', () => {
  it('auto-picks the strongest printed number', () => {
    const { state } = start(['warlord']);
    const result = applyAction(state, state.turn, { type: 'timeout' });
    const picked = result.events.find((e: GameEvent) => e.t === 'pick');
    expect(picked && picked.t === 'pick' ? picked.card.cardId : null).toBe('warlord');
    expect(picked && picked.t === 'pick' ? picked.auto : false).toBe(true);
  });
});

describe('match completion', () => {
  it('runs five rows and declares a winner by hp', () => {
    let { state } = createMatch({ seed: 'complete', firstPicker: 0 });
    let guard = 0;
    while (state.phase !== 'gameOver' && guard++ < 200) state = takeAny(state).state;

    expect(state.phase).toBe('gameOver');
    expect(state.round).toBe(state.config.rounds - 1);
    expect(state.players[0].taken.length + state.players[1].taken.length).toBe(
      state.config.rounds * state.config.rowSize,
    );
    if (state.winner !== null) {
      expect(state.players[state.winner].hp).toBeGreaterThanOrEqual(state.players[other(state.winner)].hp);
    }
  });

  it('ends early when a player reaches zero hp', () => {
    // Which seed lands a knockout depends on the card numbers, so the rule is
    // checked over a spread of matches instead of pinned to one seed that the
    // next balance pass would quietly invalidate.
    let knockouts = 0;
    for (let i = 0; i < 20; i++) {
      let { state } = createMatch({ seed: `lethal-${i}`, firstPicker: 0, config: { startHp: 3, secondPickerHpBonus: 0 } });
      let guard = 0;
      while (state.phase !== 'gameOver' && guard++ < 200) state = takeAny(state).state;
      expect(state.phase).toBe('gameOver');

      const lowest = Math.min(state.players[0].hp, state.players[1].hp);
      if (lowest === 0) knockouts++;
      // Stopping before the final row can only mean someone hit zero.
      if (state.round < state.config.rounds - 1) expect(lowest).toBe(0);
    }
    expect(knockouts).toBeGreaterThan(0);
  });
});

describe('starting hp override', () => {
  it('sets each seat independently, ignoring the seat compensation', () => {
    // The config pair can only describe a fair match plus seat compensation.
    // A campaign handicap needs the two seats set outright.
    const { state } = createMatch({ seed: 'handicap', firstPicker: 0, hp: [9, 12] });
    expect(state.players[0].hp).toBe(9);
    expect(state.players[1].hp).toBe(12);
    expect(state.players[0].maxHp).toBe(9);
    expect(state.players[1].maxHp).toBe(12);
    // The seat is still recorded, it just no longer pays out in HP.
    expect(state.players[1].pickedSecond).toBe(true);
  });

  it('leaves the fair-match path untouched when omitted', () => {
    const { state } = createMatch({ seed: 'handicap', firstPicker: 0 });
    expect(state.players[0].hp).toBe(state.config.startHp);
    expect(state.players[1].hp).toBe(state.config.startHp + state.config.secondPickerHpBonus);
  });

  it('a handicapped player can still be healed only up to their own cap', () => {
    let { state } = createMatch({ seed: 'handicap-cap', firstPicker: 0, hp: [4, 20] });
    let guard = 0;
    while (state.phase !== 'gameOver' && guard++ < 200) state = takeAny(state).state;
    expect(state.players[0].hp).toBeLessThanOrEqual(4);
    expect(state.players[1].hp).toBeLessThanOrEqual(20);
  });
});
