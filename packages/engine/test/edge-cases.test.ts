import { describe, expect, it } from 'vitest';
import { ALL_CARDS } from '@delezh/cards';
import {
  applyAction,
  autoPickUid,
  buildRows,
  createMatch,
  createRng,
  IllegalActionError,
  legalPicks,
  other,
  REDACTED_SEED,
  viewFor,
  type ApplyResult,
  type GameEvent,
  type MatchState,
  type PlayerIndex,
} from '../src/index.js';
import { battle, mk } from './helpers.js';

/**
 * Boundary behaviour of the draft loop, the battle resolver and the views.
 * Scenarios are built from explicit rows so every pick order is exact.
 */

function take(state: MatchState, cardId: string): ApplyResult {
  const card = state.open.find((c) => c !== null && c.cardId === cardId);
  if (!card) throw new Error(`${cardId} is not open: ${state.open.map((c) => c?.cardId).join(', ')}`);
  return applyAction(state, state.turn, { type: 'pick', uid: card.uid });
}

function takeAny(state: MatchState): ApplyResult {
  const first = state.open.find((c) => c !== null);
  if (!first) throw new Error('nothing to take');
  return applyAction(state, state.turn, { type: 'pick', uid: first.uid });
}

/** Plays greedily to the end of the match. */
function playOut(start: MatchState, action: (s: MatchState) => ApplyResult = takeAny): MatchState {
  let state = start;
  let guard = 0;
  while (state.phase !== 'gameOver' && guard++ < 500) state = action(state).state;
  expect(state.phase).toBe('gameOver');
  return state;
}

const FILL = ['ember', 'cog', 'shade', 'wolf-pup', 'wanderer'];

/** A row of `cards` padded with vanillas that carry no effects. */
function row(...cards: string[]): string[] {
  return [...cards, ...FILL.filter((c) => !cards.includes(c))].slice(0, 5);
}

const VANILLA = ALL_CARDS.filter((c) => c.effects.length === 0);

/**
 * Five effect-free cards whose three-two split comes out even, searched from
 * the live card data so a balance pass cannot silently break the fixture.
 */
/** The two strongest equally-strong vanillas, then three weaker ones. */
function tiedTopRow(): string[] {
  const strongest = [...VANILLA].sort((x, y) => y.power - x.power);
  for (let i = 0; i < strongest.length - 1; i++) {
    const [a, b] = [strongest[i]!, strongest[i + 1]!];
    if (a.power !== b.power) continue;
    const rest = strongest.filter((c) => c.power < a.power).slice(0, 3);
    if (rest.length === 3) return [a.id, b.id, ...rest.map((c) => c.id)];
  }
  throw new Error('no two equally strong vanilla cards');
}

function tiedRow(): string[] {
  for (const a of VANILLA)
    for (const b of VANILLA)
      for (const c of VANILLA)
        for (const d of VANILLA)
          for (const e of VANILLA) {
            const picked = [a, b, c, d, e];
            if (new Set(picked.map((x) => x.id)).size !== 5) continue;
            // Slots 0/2/4 go to the first picker, 1/3 to the second.
            if (a.power + c.power + e.power === b.power + d.power) return picked.map((x) => x.id);
          }
  throw new Error('no even three-two split exists in the current card set');
}

describe('row exhaustion', () => {
  it('gives the last card to the opponent when the player on turn owes a skip', () => {
    let { state } = createMatch({
      seed: 'edge',
      firstPicker: 0,
      rows: [['ember', 'cog', 'warlord', 'shade', 'wolf-pup']],
    });
    state = take(state, 'ember').state; // p0
    state = take(state, 'cog').state; // p1
    state = take(state, 'warlord').state; // p0, now owes a skip
    const beforeLast = take(state, 'shade'); // p1
    state = beforeLast.state;
    // The debt is paid as soon as the turn tries to return, which is while one
    // card is still on the table — so player 1 keeps the turn and takes it.
    expect(beforeLast.events.some((e: GameEvent) => e.t === 'skip' && e.player === 0)).toBe(true);
    expect(state.open.filter((c) => c !== null)).toHaveLength(1);
    expect(state.turn).toBe(1);

    const last = takeAny(state);
    expect(last.state.players[1].taken).toHaveLength(3);
    expect(last.state.players[0].taken).toHaveLength(2);
    expect(last.state.round).toBe(1); // the row closed, nothing was stranded
  });

  it('returns the last card to the skipper when both players owe a skip', () => {
    let { state } = createMatch({
      seed: 'edge',
      firstPicker: 0,
      rows: [['ember', 'cog', 'warlord', 'void-titan', 'wolf-pup']],
    });
    state = take(state, 'ember').state; // p0
    state = take(state, 'cog').state; // p1
    state = take(state, 'warlord').state; // p0 owes
    state = take(state, 'void-titan').state; // p1 owes
    expect(state.turn).toBe(0);

    const last = takeAny(state);
    // Both debts cancel across one bounce, so the last card lands on player 0.
    expect(last.state.players[0].taken.map((c) => c.cardId)).toContain('wolf-pup');
    expect(last.state.players[0].skips).toBe(0);
    expect(last.state.players[1].skips).toBe(0);
  });

  it('never leaves a card unclaimed, whatever the tempo cards do', () => {
    for (let i = 0; i < 40; i++) {
      const start = createMatch({ seed: `unclaimed-${i}`, firstPicker: 0 });
      const state = playOut(start.state);
      const claimed = [...state.players[0].taken, ...state.players[1].taken].map((c) => c.uid);
      // Rows after a knockout are never dealt, but every row that opened is
      // emptied completely — a card can never be stranded by a skip.
      const dealt = state.rows.slice(0, state.round + 1).flat().map((c) => c.uid);
      expect(new Set(claimed).size).toBe(claimed.length);
      expect(claimed.sort()).toEqual(dealt.sort());
    }
  });

  it('never surfaces the intermediate battle phase', () => {
    // endRow resolves the row and opens the next one inside a single action, so
    // a caller only ever observes `draft` or `gameOver`.
    let state = createMatch({ seed: 'phases', firstPicker: 0 }).state;
    let guard = 0;
    while (state.phase !== 'gameOver' && guard++ < 100) {
      state = takeAny(state).state;
      expect(['draft', 'gameOver']).toContain(state.phase);
    }
  });
});

describe('simultaneous death', () => {
  it('is a draw when combat and burn kill both players in the same round', () => {
    // Player 0 draws three vanillas that land under the target, player 1 the
    // burn card: at 1 hp the row winner and the burn victim are the same two
    // players. Ranked ascending, not descending — three of the *strongest*
    // vanillas now bust and hand the row to the other side, which is the
    // opposite of what this test needs to set up.
    const burner = ALL_CARDS.find((c) => c.effects.some((e) => e.kind === 'burn'));
    const ranked = [...VANILLA].sort((x, y) => x.power - y.power);
    const [s0, s1, s2] = ranked;
    const weakest = ranked.filter((c) => c !== s0 && c !== s1 && c !== s2).at(0);
    let { state } = createMatch({
      seed: 'double-ko',
      firstPicker: 0,
      config: { startHp: 1, secondPickerHpBonus: 0 },
      rows: [[s0!.id, burner!.id, s1!.id, weakest!.id, s2!.id]],
    });
    let final = takeAny(state);
    while (final.state.phase === 'draft') final = takeAny(final.state);
    state = final.state;

    expect(state.lastRound?.winner).toBe(0);
    expect(state.players.map((p) => p.hp)).toEqual([0, 0]);
    expect(state.phase).toBe('gameOver');
    // A mutual knockout is a draw even though player 0 won the row: the rows-won
    // tiebreak only applies when both players are still alive.
    expect(state.winner).toBeNull();
    expect(state.players[0].roundsWon).toBe(1);
    expect(final.events.some((e: GameEvent) => e.t === 'gameOver' && e.winner === null)).toBe(true);
  });

  it('is a draw when no row is ever won', () => {
    const tied = tiedRow();
    const start = createMatch({
      seed: 'stalemate',
      firstPicker: 0,
      config: { secondPickerHpBonus: 0 },
      rows: [tied, tied, tied, tied, tied],
    });
    const state = playOut(start.state);
    expect(state.players.map((p) => p.hp)).toEqual([start.state.config.startHp, start.state.config.startHp]);
    expect(state.players.map((p) => p.roundsWon)).toEqual([0, 0]);
    expect(state.winner).toBeNull();
  });
});

describe('timeout', () => {
  it('is rejected when it is not your turn', () => {
    const { state } = createMatch({ seed: 'timeout', firstPicker: 0 });
    expect(() => applyAction(state, 1, { type: 'timeout' })).toThrow(IllegalActionError);
  });

  it('is rejected once the match is over, for either player', () => {
    const state = playOut(createMatch({ seed: 'timeout-over', firstPicker: 0 }).state);
    expect(() => applyAction(state, 0, { type: 'timeout' })).toThrow(IllegalActionError);
    expect(() => applyAction(state, 1, { type: 'timeout' })).toThrow(IllegalActionError);
    expect(legalPicks(state, state.turn)).toEqual([]);
  });

  it('offers no legal picks to the player waiting for their turn', () => {
    const { state } = createMatch({ seed: 'off-turn', firstPicker: 0 });
    expect(legalPicks(state, 0)).toHaveLength(5);
    expect(legalPicks(state, 1)).toEqual([]);
  });

  it('breaks a power tie on slot order so hosts stay in sync', () => {
    const tied = tiedTopRow();
    const { state } = createMatch({ seed: 'tie', firstPicker: 0, rows: [tied] });
    expect(autoPickUid(state)).toBe(state.open[0]?.uid);
    const picked = applyAction(state, 0, { type: 'timeout' }).events.find((e: GameEvent) => e.t === 'pick');
    expect(picked && picked.t === 'pick' ? picked.card.cardId : null).toBe(tied[0]);
  });

  it('takes the only remaining card', () => {
    let { state } = createMatch({ seed: 'last', firstPicker: 0, rows: [row('warlord')] });
    while (state.open.filter((c) => c !== null).length > 1) state = takeAny(state).state;
    const remaining = state.open.find((c) => c !== null);
    const result = applyAction(state, state.turn, { type: 'timeout' });
    const picked = result.events.find((e: GameEvent) => e.t === 'pick');
    expect(picked && picked.t === 'pick' ? picked.card.uid : null).toBe(remaining?.uid);
    expect(result.state.round).toBe(1);
  });

  it('drives a whole match reproducibly', () => {
    const auto = (s: MatchState): ApplyResult => applyAction(s, s.turn, { type: 'timeout' });
    const a = playOut(createMatch({ seed: 'auto', firstPicker: 0 }).state, auto);
    const b = playOut(createMatch({ seed: 'auto', firstPicker: 0 }).state, auto);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('tempo across rows', () => {
  /** Fills the row so `cardId` is the very last card left. */
  function leaveLast(state: MatchState, cardId: string): MatchState {
    let s = state;
    while (s.open.filter((c) => c !== null).length > 1) {
      const spare = s.open.find((c) => c !== null && c.cardId !== cardId);
      if (!spare) break;
      s = applyAction(s, s.turn, { type: 'pick', uid: spare.uid }).state;
    }
    return s;
  }

  it('carries an extra pick into the next row when quickstep ends the row', () => {
    let { state } = createMatch({
      seed: 'extra-carry',
      firstPicker: 0,
      rows: [row('quickstep'), row()],
    });
    state = leaveLast(state, 'quickstep');
    const closer = state.turn;
    state = take(state, 'quickstep').state;

    // The row ended before the extra could be spent, so — exactly like the skip
    // debt — it survives into the next row instead of being lost.
    expect(state.round).toBe(1);
    expect(state.players[closer].extras).toBe(1);

    const firstOfRow = state.turn;
    state = takeAny(state).state;
    if (firstOfRow === closer) {
      expect(state.turn).toBe(closer); // spent immediately: two picks in a row
      expect(state.players[closer].extras).toBe(0);
    } else {
      expect(state.players[closer].extras).toBe(1); // still owed to them
    }
  });

  it('stacks a carried extra with a fresh one for three picks in a row', () => {
    let { state } = createMatch({
      seed: 'extra-stack',
      firstPicker: 0,
      config: { firstPickerRule: 'fixed' },
      rows: [row('quickstep'), row('quickstep')],
    });
    state = leaveLast(state, 'quickstep');
    expect(state.turn).toBe(0);
    state = take(state, 'quickstep').state; // closes row 0 with an extra owed
    expect(state.players[0].extras).toBe(1);
    expect(state.turn).toBe(0);

    state = take(state, 'quickstep').state; // row 1: +1 extra, one spent
    expect(state.players[0].extras).toBe(1);
    expect(state.turn).toBe(0);
    state = takeAny(state).state; // second pick, spends the carried extra
    expect(state.turn).toBe(0);
    expect(state.players[0].extras).toBe(0);
    state = takeAny(state).state; // third pick in a row
    expect(state.players[0].row).toHaveLength(3);
    expect(state.turn).toBe(1); // the extras are spent, player 1 finally picks
  });

  it('spends an extra pick before paying a pending skip', () => {
    let { state } = createMatch({
      seed: 'extra-vs-skip',
      firstPicker: 0,
      config: { firstPickerRule: 'fixed' },
      rows: [row('quickstep'), row('warlord')],
    });
    state = leaveLast(state, 'quickstep');
    state = take(state, 'quickstep').state; // p0 carries an extra into row 1
    expect(state.players[0].extras).toBe(1);

    const withDebt = take(state, 'warlord'); // p0 now owes a skip as well
    state = withDebt.state;
    expect(state.players[0].skips).toBe(1);
    // The extra is immediate, the skip is "your next turn": the extra wins.
    expect(withDebt.events.some((e: GameEvent) => e.t === 'extraPick')).toBe(true);
    expect(state.turn).toBe(0);
    expect(state.players[0].extras).toBe(0);

    // The skip itself is only paid when the turn tries to come back, one pick later.
    const afterExtra = takeAny(state);
    expect(afterExtra.events.some((e: GameEvent) => e.t === 'skip')).toBe(false);
    expect(afterExtra.state.turn).toBe(1);
    const paid = takeAny(afterExtra.state);
    expect(paid.events.some((e: GameEvent) => e.t === 'skip' && e.player === 0)).toBe(true);
    expect(paid.state.turn).toBe(1);
  });

  it('gives three picks in a row for an extra plus the opponent skipping', () => {
    let { state } = createMatch({
      seed: 'three-picks',
      firstPicker: 0,
      rows: [row('quickstep'), row('warlord')],
    });
    state = leaveLast(state, 'quickstep');
    state = take(state, 'quickstep').state; // p0 carries an extra; p1 leads row 1
    expect(state.turn).toBe(1);
    state = take(state, 'warlord').state; // p1 buys a skip
    // `pickedSecond` is the seat, not the card count: tempo cards can hand the
    // three-card side to the player who was second to pick.
    expect(state.players[0].pickedSecond).toBe(true);
    const takers: PlayerIndex[] = [];
    while (state.round === 1 && state.phase === 'draft') {
      takers.push(state.turn);
      state = takeAny(state).state;
    }
    // Player 0 picks three times running — the extra, then player 1's skip.
    expect(takers).toEqual([0, 0, 0, 1]);
    expect(state.players[0].taken.filter((c) => c.row === 1)).toHaveLength(3);
    expect(state.players[1].taken.filter((c) => c.row === 1)).toHaveLength(2);
  });

  it('pays a skip owed at row start before the first pick', () => {
    let { state } = createMatch({
      seed: 'skip-at-start',
      firstPicker: 0,
      config: { firstPickerRule: 'fixed' },
      rows: [['ember', 'cog', 'shade', 'wolf-pup', 'warlord'], row()],
    });
    while (state.round === 0) state = takeAny(state).state; // p0 closes row 0 on Warlord
    expect(state.players[0].taken.at(-1)?.cardId).toBe('warlord');

    // Player 0 is the nominal first picker of row 1 but owes a skip, so the turn
    // moves on immediately. `firstPicker` records the seat, `turn` the reality.
    expect(state.firstPicker).toBe(0);
    expect(state.turn).toBe(1);
    expect(state.players[0].skips).toBe(0);
    expect(state.players[0].pickedSecond).toBe(false);
  });

  it('resolves a row made entirely of skip cards', () => {
    const skippers = ALL_CARDS.filter((c) => c.effects.some((e) => e.kind === 'skipNextPick'));
    // A row holds one copy of each card, so pending skips can never reach the
    // 16-bounce guard in setTurn as long as the set stays this small.
    expect(skippers.length).toBeGreaterThan(1);
    expect(skippers.length).toBeLessThan(16);
    let { state } = createMatch({
      seed: 'all-skips',
      firstPicker: 0,
      rows: [row(...skippers.slice(0, 4).map((c) => c.id))],
    });
    const takers: PlayerIndex[] = [];
    while (state.round === 0 && state.phase === 'draft') {
      takers.push(state.turn);
      state = takeAny(state).state;
    }
    // Each skip is answered by the opponent's own skip, so the turn keeps
    // alternating and the row still empties.
    expect(takers.slice(0, 4)).toEqual([0, 1, 0, 1]);
    expect(state.players[0].taken.length + state.players[1].taken.length).toBe(5);
    expect(state.players[0].skipsUsed + state.players[1].skipsUsed).toBeGreaterThan(0);
  });
});

describe('config extremes', () => {
  it('ends a single-round match after one row', () => {
    const state = playOut(createMatch({ seed: 'one-round', firstPicker: 0, config: { rounds: 1 } }).state);
    expect(state.round).toBe(0);
    expect(state.players[0].taken.length + state.players[1].taken.length).toBe(state.config.rowSize);
  });

  it('plays a one-card row against an empty opposing side', () => {
    const state = playOut(createMatch({ seed: 'row-1', firstPicker: 0, config: { rowSize: 1 } }).state);
    expect(state.players[0].taken.length + state.players[1].taken.length).toBe(state.config.rounds);
    // The player without a card in the row simply fields zero power.
    expect(Math.min(...(state.lastRound?.power ?? [1, 1]))).toBe(0);
  });

  it('survives one hit point', () => {
    for (const seed of ['glass', 'pane', 'sliver', 'shard']) {
      const state = playOut(
        createMatch({ seed, firstPicker: 0, config: { startHp: 1, secondPickerHpBonus: 0 } }).state,
      );
      const dead = state.players.filter((p) => p.hp === 0).length;
      // At 1 hp any decided row is lethal, so the match can only run past a row
      // that was tied — and burn can kill the winner of the row along with the loser.
      if (dead === 0) expect(state.lastRound?.winner).toBeNull();
      else expect(state.winner).toBe(dead === 2 ? null : state.players[0].hp === 0 ? 1 : 0);
    }
  });

  it('decides on rows won when damagePerPower is zero', () => {
    // Vanilla rows only: with combat damage switched off and no burn or heal in
    // play, hp cannot move and the match rests entirely on the rows-won tiebreak.
    const state = playOut(
      createMatch({
        seed: 'no-damage',
        firstPicker: 0,
        config: { damagePerPower: 0, secondPickerHpBonus: 0 },
        rows: [row(), row(), row(), row(), row()],
      }).state,
    );
    expect(state.players.map((p) => p.hp)).toEqual([state.config.startHp, state.config.startHp]);
    const [a, b] = state.players;
    expect(state.winner).toBe(a.roundsWon === b.roundsWon ? null : a.roundsWon > b.roundsWon ? 0 : 1);
  });

  it('caps combat damage but not burn with maxRoundDamage', () => {
    // Under the target, so this measures the cap rather than the bust: 20 power
    // would score nothing and the row would go the other way.
    const brute = mk({ power: 11 });
    const priest = mk({ power: 0, effects: [{ kind: 'burn', amount: 2 }] });
    // maxRoundDamage caps the row margin only; burn is direct damage and lands
    // on top of the cap, exactly as it bypasses shields.
    const result = battle({ a: [brute], b: [priest], config: { maxRoundDamage: 1 } });
    expect(result.hpDelta).toEqual([-2, -1]);
  });

  it('rejects a nonsense round count instead of building a broken match', () => {
    expect(() => createMatch({ seed: 'zero', firstPicker: 0, config: { rounds: 0 } })).toThrow();
  });

  it('rejects an explicit row of the wrong size or with an unknown card', () => {
    expect(() => createMatch({ seed: 'bad', firstPicker: 0, rows: [['ember', 'cog']] })).toThrow(/exactly 5/);
    expect(() => createMatch({ seed: 'bad', firstPicker: 0, rows: [row('not-a-card')] })).toThrow(/Unknown card/);
  });

  it('ignores explicit rows past the configured round count', () => {
    const { state } = createMatch({
      seed: 'extra-rows',
      firstPicker: 0,
      config: { rounds: 1 },
      rows: [row('warlord'), row('quickstep')],
    });
    expect(state.rows).toHaveLength(1);
  });
});

describe('serialisation and purity', () => {
  it('continues identically after a JSON round trip', () => {
    let live = createMatch({ seed: 'json', firstPicker: 0 }).state;
    for (let i = 0; i < 7; i++) live = takeAny(live).state;

    let copy = JSON.parse(JSON.stringify(live)) as MatchState;
    expect(copy).toEqual(live);
    while (live.phase !== 'gameOver') {
      live = takeAny(live).state;
      copy = takeAny(copy).state;
    }
    expect(JSON.stringify(copy)).toBe(JSON.stringify(live));
  });

  it('shares no mutable structure between the input and the result', () => {
    const { state } = createMatch({ seed: 'pure', firstPicker: 0 });
    const result = applyAction(state, 0, { type: 'pick', uid: state.open[0]!.uid });
    result.state.players[0].hp = 999;
    result.state.rows[1]![0]!.cardId = 'tampered';
    expect(state.players[0].hp).toBe(state.config.startHp);
    expect(state.rows[1]![0]!.cardId).not.toBe('tampered');
  });

  it('advances seq once per action and turnId once per turn', () => {
    let state = createMatch({ seed: 'counters', firstPicker: 0 }).state;
    let seq = state.seq;
    let turnId = state.turnId;
    while (state.phase !== 'gameOver') {
      state = takeAny(state).state;
      expect(state.seq).toBe(seq + 1);
      // Every action opens exactly one new turn, except the one that ends the match.
      expect(state.turnId).toBe(turnId + (state.phase === 'gameOver' ? 0 : 1));
      seq = state.seq;
      turnId = state.turnId;
    }
  });
});

describe('viewFor', () => {
  it('never reveals an unpeeked future row at any point of a match', () => {
    let state = createMatch({ seed: 'view-walk', firstPicker: 0 }).state;
    let guard = 0;
    while (state.phase !== 'gameOver' && guard++ < 100) {
      for (const p of [0, 1] as PlayerIndex[]) {
        const view = viewFor(state, p);
        const visible = Math.max(state.round, state.players[p].peekedRow ?? -1);
        view.rows.forEach((r, index) => {
          const expected = index <= visible ? state.config.rowSize : 0;
          expect(r.length, `player ${p} row ${index} at round ${state.round}`).toBe(expected);
        });
        expect(view.players[other(p)].peekedRow).toBeNull();
      }
      state = takeAny(state).state;
    }
  });

  it('reveals the final row when Seer is taken in the row before it', () => {
    const rows = [row(), row(), row(), row('seer'), row()];
    let state = createMatch({ seed: 'seer-last', firstPicker: 0, rows }).state;
    while (state.round < 3) state = takeAny(state).state;
    const seerTaker = state.turn;
    state = take(state, 'seer').state;

    expect(state.players[seerTaker].peekedRow).toBe(4);
    expect(viewFor(state, seerTaker).rows[4]).toHaveLength(5);
    expect(viewFor(state, other(seerTaker)).rows[4]).toHaveLength(0);
  });

  it('lets both players peek without seeing each other', () => {
    const rows = [row('seer'), row('seer'), row(), row(), row()];
    let state = createMatch({ seed: 'both-peek', firstPicker: 0, rows }).state;
    state = take(state, 'seer').state; // p0 peeks row 1
    while (state.round === 0) state = takeAny(state).state;
    while (state.turn !== 1) state = takeAny(state).state;
    state = take(state, 'seer').state; // p1 peeks row 2

    expect(state.players[0].peekedRow).toBe(1);
    expect(state.players[1].peekedRow).toBe(2);
    expect(viewFor(state, 0).rows[2]).toHaveLength(0);
    expect(viewFor(state, 1).rows[2]).toHaveLength(5);
    expect(viewFor(state, 0).players[1].peekedRow).toBeNull();
    expect(viewFor(state, 1).players[0].peekedRow).toBeNull();
  });

  it('does not mutate the state it summarises', () => {
    const { state } = createMatch({ seed: 'view-pure', firstPicker: 0 });
    const snapshot = JSON.stringify(state);
    viewFor(state, 0);
    viewFor(state, 1);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('redacts the seed, so hidden rows cannot be rebuilt from the view', () => {
    // Every row is generated purely from the seed, so shipping it alongside a
    // blanked `rows` would hide nothing at all — a client could just call
    // createMatch and read the whole match, and Seer would be worthless.
    const { state } = createMatch({ seed: 'leaky', firstPicker: 0 });
    const view = viewFor(state, 1);

    expect(view.rows[4]).toHaveLength(0);
    expect(view.seed).toBe(REDACTED_SEED);
    expect(view.seed).not.toBe(state.seed);
    expect(view.rngState).toBe(0);

    const rebuilt = createMatch({ seed: view.seed, firstPicker: view.firstPicker, config: view.config });
    expect(rebuilt.state.rows).not.toEqual(state.rows);
  });

  it('cannot be used to keep playing past the end of the visible row', () => {
    // A view is a snapshot for rendering: the next row is empty in it, so the
    // draft deadlocks there. Hosts must apply actions to the full state.
    let view = viewFor(createMatch({ seed: 'view-play', firstPicker: 0 }).state, 0);
    while (view.round === 0 && view.phase === 'draft') view = takeAny(view).state;
    expect(view.round).toBe(1);
    expect(view.open).toEqual([]);
    expect(() => applyAction(view, view.turn, { type: 'timeout' })).toThrow(IllegalActionError);
  });
});

describe('pool generation', () => {
  const pool = (ids: string[], maxCopies = 1, weight = 1) =>
    ids.map((id) => mk({ id, power: 1, weight, maxCopies }));

  it('falls back past maxCopies rather than failing to fill a row', () => {
    const rows = buildRows(createRng('starved'), pool(['a', 'b', 'c', 'd', 'e']), 5, 5);
    expect(rows).toHaveLength(5);
    for (const r of rows) {
      expect(r).toHaveLength(5);
      expect(new Set(r.map((c) => c.cardId)).size).toBe(5);
    }
    // Per-row uniqueness is the constraint that survives; the copy cap is not.
    const copies = new Map<string, number>();
    for (const card of rows.flat()) copies.set(card.cardId, (copies.get(card.cardId) ?? 0) + 1);
    expect([...copies.values()]).toEqual([5, 5, 5, 5, 5]);
  });

  it('keeps uid and slot consistent after the shuffle', () => {
    const rows = buildRows(createRng('uids'), pool(['a', 'b', 'c', 'd', 'e', 'f'], 3), 3, 5);
    const uids = rows.flat().map((c) => c.uid);
    expect(new Set(uids).size).toBe(uids.length);
    rows.forEach((r, index) =>
      r.forEach((card, slot) => {
        expect(card.row).toBe(index);
        expect(card.slot).toBe(slot);
        expect(card.uid).toBe(`r${index}s${slot}`);
      }),
    );
  });

  it('tolerates a pool where every weight is zero', () => {
    const rows = buildRows(createRng('zero'), pool(['a', 'b', 'c', 'd', 'e', 'f'], 3, 0), 2, 5);
    for (const r of rows) expect(new Set(r.map((c) => c.cardId)).size).toBe(5);
  });

  it('refuses a pool smaller than one row and deals nothing for zero rounds', () => {
    expect(() => buildRows(createRng('small'), pool(['a', 'b', 'c']), 1, 5)).toThrow(/too small/);
    expect(buildRows(createRng('none'), pool(['a', 'b', 'c', 'd', 'e']), 0, 5)).toEqual([]);
  });
});

describe('duplicate copies of one card in a row', () => {
  /**
   * Two instances of the same card share a single `CardDef` object, so any
   * self-exclusion has to work on position rather than identity.
   */
  it('counts the other copy of an identical card', () => {
    const rat = mk({
      power: 1,
      tags: ['swarm'],
      effects: [{ kind: 'powerPer', amount: 3, counter: { scope: 'self', tag: 'swarm', excludeSelf: true } }],
    });
    expect(battle({ a: [rat, rat], b: [] }).raw[0]).toBe(8);
    expect(battle({ a: [rat], b: [] }).raw[0]).toBe(1);
  });

  it('never lets excludeSelf remove a card from the opponent pile', () => {
    const spy = mk({
      power: 1,
      faction: 'fire',
      effects: [
        { kind: 'powerIf', amount: 3, cond: { type: 'count', counter: { scope: 'opponent', faction: 'fire', excludeSelf: true } } },
      ],
    });
    expect(battle({ a: [spy], b: [spy] }).raw[0]).toBe(4);
  });

  it('mirrors the strongest other copy', () => {
    const idol = mk({ power: 2, effects: [{ kind: 'mirrorStrongest' }] });
    const big = mk({ power: 5 });
    expect(battle({ a: [idol, idol], b: [] }).raw[0]).toBe(4);
    expect(battle({ a: [idol, idol, big], b: [] }).raw[0]).toBe(15);
  });
});
