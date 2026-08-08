import { cardMatches, type CardDef, type Condition, type Counter } from '@delezh/cards';
import type { MatchConfig } from './config.js';
import type { CardBattleLine, CardInstance, PlayerIndex, RoundResult } from './types.js';

/** Everything a condition or counter can read. Kept tiny and side-effect free. */
export interface SideContext {
  cards: CardDef[];
  hp: number;
  pickedSecond: boolean;
}

export interface BattleInput {
  round: number;
  sides: [SideContext, SideContext];
  instances: [CardInstance[], CardInstance[]];
  config: MatchConfig;
}

function count(
  counter: Counter,
  selfIndex: number,
  sides: [SideContext, SideContext],
  side: PlayerIndex,
): number {
  const own = counter.scope === 'self';
  const target = own ? sides[side] : sides[side === 0 ? 1 : 0];
  let n = 0;
  target.cards.forEach((card, index) => {
    // Exclusion is by position, not by identity: two copies of one card share a
    // single CardDef, so comparing objects would drop both — and would drop the
    // opponent's copy too, which is never "self".
    if (counter.excludeSelf && own && index === selfIndex) return;
    if (cardMatches(card, counter)) n++;
  });
  return n;
}

function test(
  cond: Condition,
  selfIndex: number,
  sides: [SideContext, SideContext],
  side: PlayerIndex,
): boolean {
  const me = sides[side];
  const foe = sides[side === 0 ? 1 : 0];
  switch (cond.type) {
    case 'count':
      return count(cond.counter, selfIndex, sides, side) >= (cond.min ?? 1);
    case 'pickedSecond':
      return me.pickedSecond;
    case 'hpAtMost':
      return me.hp <= cond.value;
    case 'behind':
      return me.hp < foe.hp;
  }
}

/** Power contributed by one card, after its own static modifiers. */
function lineFor(
  instance: CardInstance,
  card: CardDef,
  sides: [SideContext, SideContext],
  side: PlayerIndex,
  selfIndex: number,
): CardBattleLine {
  const base = card.power;
  let bonus = 0;

  for (const effect of card.effects) {
    switch (effect.kind) {
      case 'powerIf':
        if (test(effect.cond, selfIndex, sides, side)) bonus += effect.amount;
        break;
      case 'powerPer':
        bonus += effect.amount * count(effect.counter, selfIndex, sides, side);
        break;
      case 'mirrorStrongest': {
        // Base powers only — never other cards' bonuses — so two Mirror Idols
        // cannot feed each other and resolution stays order-independent.
        let strongest = 0;
        sides[side].cards.forEach((peer, index) => {
          if (index === selfIndex) return;
          if (peer.power > strongest) strongest = peer.power;
        });
        bonus += Math.max(0, strongest - base);
        break;
      }
      case 'lonerBonus':
        bonus += effect.amount - sides[side].cards.length;
        break;
      default:
        break;
    }
  }

  return {
    uid: instance.uid,
    cardId: card.id,
    base,
    bonus,
    total: Math.max(0, base + bonus),
  };
}

function sumEffect(cards: CardDef[], kind: 'weaken' | 'shield' | 'burn' | 'heal'): number {
  let total = 0;
  for (const card of cards) {
    for (const effect of card.effects) {
      if (effect.kind === kind) total += effect.amount;
    }
  }
  return total;
}

/**
 * Resolves one row into HP changes.
 *
 * Fixed pipeline, so the order of effects inside a card never matters:
 *   1. per-card power (synergies, mirror, loner)
 *   2. weaken — each side reduces the opponent's total
 *   3. combat damage = |difference|, reduced by the loser's shield
 *   4. burn (direct, ignores shield) and heal
 */
export function resolveBattle(input: BattleInput, hpMax: [number, number]): RoundResult {
  const { sides, instances, config } = input;

  const lines: [CardBattleLine[], CardBattleLine[]] = [
    instances[0].map((inst, i) => lineFor(inst, sides[0].cards[i] as CardDef, sides, 0, i)),
    instances[1].map((inst, i) => lineFor(inst, sides[1].cards[i] as CardDef, sides, 1, i)),
  ];

  const raw: [number, number] = [
    lines[0].reduce((s, l) => s + l.total, 0),
    lines[1].reduce((s, l) => s + l.total, 0),
  ];

  const weaken: [number, number] = [sumEffect(sides[0].cards, 'weaken'), sumEffect(sides[1].cards, 'weaken')];
  const shield: [number, number] = [sumEffect(sides[0].cards, 'shield'), sumEffect(sides[1].cards, 'shield')];
  const burn: [number, number] = [sumEffect(sides[0].cards, 'burn'), sumEffect(sides[1].cards, 'burn')];
  const heal: [number, number] = [sumEffect(sides[0].cards, 'heal'), sumEffect(sides[1].cards, 'heal')];

  const power: [number, number] = [Math.max(0, raw[0] - weaken[1]), Math.max(0, raw[1] - weaken[0])];

  const diff = scoreRow(power, lines, config);
  const winner: PlayerIndex | null = diff > 0 ? 0 : diff < 0 ? 1 : null;

  let combat = Math.abs(diff) * config.damagePerPower;
  if (config.maxRoundDamage > 0) combat = Math.min(combat, config.maxRoundDamage);

  const hpDelta: [number, number] = [0, 0];
  if (winner !== null) {
    const loser = winner === 0 ? 1 : 0;
    hpDelta[loser] -= Math.max(0, combat - shield[loser]);
  }
  hpDelta[0] += heal[0] - burn[1];
  hpDelta[1] += heal[1] - burn[0];

  const hpAfter: [number, number] = [
    clamp(sides[0].hp + hpDelta[0], 0, hpMax[0]),
    clamp(sides[1].hp + hpDelta[1], 0, hpMax[1]),
  ];

  return {
    round: input.round,
    lines,
    raw,
    power,
    weaken,
    shield,
    burn,
    heal,
    hpDelta: [hpAfter[0] - sides[0].hp, hpAfter[1] - sides[1].hp],
    winner,
    hpAfter,
  };
}

/**
 * Turns two finished sides into a signed margin: positive means player 0 took
 * the row, and the magnitude is what damage is charged on.
 *
 * Every rule funnels into one number so the whole of the rest of the match —
 * shields, burn, the HP bar, the event log, the bot's rollout — is unchanged by
 * which rule is in play.
 */
function scoreRow(
  power: [number, number],
  lines: [CardBattleLine[], CardBattleLine[]],
  config: MatchConfig,
): number {
  switch (config.rowRule) {
    case 'sum':
      return power[0] - power[1];

    case 'closest': {
      // Over the target scores nothing at all. Deliberately harsh: a rule where
      // busting merely costs a little is a rule players can ignore.
      const effective = power.map((p) => (p > config.rowTarget ? 0 : p)) as [number, number];
      return effective[0] - effective[1];
    }

    case 'lanes': {
      // Position i against position i, in pick order. The longer side's extra
      // card has nothing to beat, so it takes its position unopposed.
      const length = Math.max(lines[0].length, lines[1].length);
      let won = 0;
      for (let i = 0; i < length; i++) {
        const mine = lines[0][i]?.total ?? -1;
        const theirs = lines[1][i]?.total ?? -1;
        if (mine > theirs) won++;
        else if (theirs > mine) won--;
      }
      return won;
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Convenience wrapper used by the bot and the UI preview to score a
 * hypothetical row.
 *
 * `rule` matters because under `closest` more power is not better: a side over
 * the target is worth nothing, so a heuristic that maximises the raw total
 * would be steering straight into a bust. Passing the config keeps the bot's
 * idea of a good row and the resolver's idea of a won row in agreement.
 */
export function rowPower(
  cards: CardDef[],
  opponent: CardDef[],
  pickedSecond = false,
  hp = 20,
  foeHp = 20,
  rule: Pick<MatchConfig, 'rowRule' | 'rowTarget'> = { rowRule: 'sum', rowTarget: 0 },
): number {
  const sides: [SideContext, SideContext] = [
    { cards, hp, pickedSecond },
    { cards: opponent, hp: foeHp, pickedSecond: !pickedSecond },
  ];
  let total = 0;
  cards.forEach((card, i) => {
    total += lineFor({ uid: `t${i}`, cardId: card.id, row: 0, slot: i }, card, sides, 0, i).total;
  });
  return rule.rowRule === 'closest' && total > rule.rowTarget ? 0 : total;
}

export function resolveLines(cards: CardDef[], opponent: CardDef[], pickedSecond = false): CardBattleLine[] {
  const sides: [SideContext, SideContext] = [
    { cards, hp: 20, pickedSecond },
    { cards: opponent, hp: 20, pickedSecond: !pickedSecond },
  ];
  return cards.map((card, i) => lineFor({ uid: `t${i}`, cardId: card.id, row: 0, slot: i }, card, sides, 0, i));
}
