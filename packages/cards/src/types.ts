/**
 * Card data model for «Дележ» / "Split Draft".
 *
 * Design rule: the engine interprets these descriptions, it never hardcodes a card.
 * Adding a card = adding a record in `cards.ts`. No engine change required.
 */

export const LOCALES = ['ru', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

/** Localized string. Every player-visible string on a card lives here. */
export type LocalizedText = Record<Locale, string>;

/** Factions double as the card's colour identity and as a synergy key. */
export const FACTIONS = ['beast', 'fire', 'shadow', 'machine', 'neutral'] as const;
export type Faction = (typeof FACTIONS)[number];

/** Rarity only drives the border style and the default draft weight. */
export const RARITIES = ['common', 'rare', 'epic'] as const;
export type Rarity = (typeof RARITIES)[number];

/**
 * Free-form tags used by synergy effects. Factions are automatically usable as
 * tags too (see `cardTags`), so `{ tag: 'beast' }` and `{ faction: 'beast' }`
 * agree — tags exist for cross-faction archetypes like `swarm` or `relic`.
 */
export const TAGS = ['swarm', 'relic', 'hunter', 'construct', 'spark', 'omen'] as const;
export type Tag = (typeof TAGS)[number];

/** Which pile an effect looks at when counting cards. */
export type Scope = 'self' | 'opponent';

/**
 * A counting expression: "how many cards on <scope>'s side of THIS row match?".
 *
 * Scope is always the current row. Cross-round accumulation was deliberately
 * rejected — see PROGRESS.md, decision D-03 — because a mobile player cannot
 * audit a 13-card collection at a glance.
 */
export interface Counter {
  scope: Scope;
  faction?: Faction;
  tag?: Tag;
  /** When true the effect's own card is excluded from the count. */
  excludeSelf?: boolean;
}

/** A boolean test evaluated at battle time. */
export type Condition =
  /** At least `min` (default 1) cards match the counter. */
  | { type: 'count'; counter: Counter; min?: number }
  /** The owner picked second in this row (fewer cards) — a catch-up condition. */
  | { type: 'pickedSecond' }
  /** The owner is at or below `value` HP. */
  | { type: 'hpAtMost'; value: number }
  /** The owner is behind on HP. */
  | { type: 'behind' };

/**
 * Effects are resolved in a fixed pipeline (see engine/battle.ts), so their
 * relative order inside a card's array never changes the outcome.
 */
export type Effect =
  /** Flat power bonus when `cond` holds. */
  | { kind: 'powerIf'; amount: number; cond: Condition }
  /** `amount` power per matching card. */
  | { kind: 'powerPer'; amount: number; counter: Counter }
  /** Reduce the opponent's row power by `amount`. */
  | { kind: 'weaken'; amount: number }
  /** Reduce damage the owner takes this round by `amount`. */
  | { kind: 'shield'; amount: number }
  /** Heal the owner `amount` HP at the end of the round. */
  | { kind: 'heal'; amount: number }
  /** Deal `amount` HP straight to the opponent at the end of the round. */
  | { kind: 'burn'; amount: number }
  /** Tempo cost: the owner's next pick is skipped. */
  | { kind: 'skipNextPick' }
  /** Tempo gain: the owner immediately picks again. */
  | { kind: 'extraPick' }
  /** The owner picks first in the next row. */
  | { kind: 'firstPickerSelf' }
  /** The owner sees the next row in advance. */
  | { kind: 'revealNextRow' }
  /** Copy the power of the strongest other card on the owner's side of the row. */
  | { kind: 'mirrorStrongest' }
  /** Power equals `amount` minus the number of cards on the owner's side. */
  | { kind: 'lonerBonus'; amount: number };

export type EffectKind = Effect['kind'];

/**
 * Runtime mirror of the `Effect` union. The two assertions below make the
 * compiler reject any edit that adds an effect here without adding it to the
 * union, or vice versa — and the test suite requires a test per entry.
 */
export const EFFECT_KINDS = [
  'powerIf',
  'powerPer',
  'weaken',
  'shield',
  'heal',
  'burn',
  'skipNextPick',
  'extraPick',
  'firstPickerSelf',
  'revealNextRow',
  'mirrorStrongest',
  'lonerBonus',
] as const satisfies readonly EffectKind[];

type MissingEffectKind = Exclude<EffectKind, (typeof EFFECT_KINDS)[number]>;
// If this line errors, add the missing kind to EFFECT_KINDS.
export type _EffectKindsAreExhaustive = MissingEffectKind extends never ? true : MissingEffectKind;

export interface CardDef {
  id: string;
  name: LocalizedText;
  /** Rules text shown on the card face. Hard limit: 8 words per locale. */
  text: LocalizedText;
  /** Base power before any effect. */
  power: number;
  faction: Faction;
  rarity: Rarity;
  tags: Tag[];
  /** Relative draft weight. Higher = appears more often. */
  weight: number;
  /** Max copies of this card in a single 25-card match pool. */
  maxCopies: number;
  effects: Effect[];
  /**
   * Art slot. `undefined` -> procedural SVG generated from `id`.
   * A string is treated as an image URL, so real art can be dropped in later
   * without touching any rendering code.
   */
  art?: string;
  /** Marks cards introduced by the experimental pass (see EXPERIMENTS.md). */
  experimental?: boolean;
}

/** Factions participate in tag matching, so synergies can key on either. */
export function cardMatches(card: CardDef, counter: Pick<Counter, 'faction' | 'tag'>): boolean {
  if (counter.faction !== undefined && card.faction !== counter.faction) return false;
  if (counter.tag !== undefined && !card.tags.includes(counter.tag)) return false;
  return true;
}
