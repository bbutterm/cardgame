/**
 * Every tunable number lives here so the balance simulator can sweep them
 * without touching game code. Values below are the outcome of the balance runs
 * documented in PROGRESS.md.
 */
export interface MatchConfig {
  /** Number of rows drafted in a match. */
  rounds: number;
  /** Cards revealed per row. Odd on purpose: the row splits 3/2. */
  rowSize: number;
  /** Starting HP for the player who picks first in row 1. */
  startHp: number;
  /**
   * Extra HP for the player who picks second in row 1. Compensation for the
   * first-picker edge; tuned by simulation.
   */
  secondPickerHpBonus: number;
  /** Damage dealt per point of row-power difference. */
  damagePerPower: number;
  /** Hard cap on damage from a single round (0 = uncapped). */
  maxRoundDamage: number;
  /** How the first picker of each row after the first is decided. */
  firstPickerRule: FirstPickerRule;
  /** How a row is scored once both sides have their cards. */
  rowRule: RowRule;
  /** Target total for `rowRule: 'closest'`. Ignored by the other rules. */
  rowTarget: number;
  /** Pick timer in ms. The host enforces it; the engine only stores it. */
  pickTimeoutMs: number;
  /** Grace period for reconnecting into a live match, in ms. */
  reconnectGraceMs: number;
}

export type RowRule =
  /**
   * Row power is summed, higher side wins. Simple, and measurably shallow: on a
   * pure-vanilla pool a `hard` bot beats a `normal` one 50.0% of the time,
   * because "take the biggest number" is exactly optimal and there is nothing
   * left to be better at. All depth has to come from the cards.
   */
  | 'sum'
  /**
   * Closest to `rowTarget` without exceeding it; going over scores nothing.
   * Makes a big number a liability rather than always a prize, and gives the
   * three-card seat a real cost — it is forced to take one more card.
   */
  | 'closest'
  /**
   * Cards are placed in the order they were taken and fight the opposing card
   * in the same position; the row goes to whoever wins more positions. An
   * unopposed position (the three-card seat's extra card) counts as won. Makes
   * *when* you take a card matter, not only *which*.
   */
  | 'lanes';

export type FirstPickerRule =
  /** Players swap the first pick every row. */
  | 'alternate'
  /** Whoever lost the previous row picks first (rubber band). */
  | 'loser'
  /** The first picker of row 1 keeps it all match. */
  | 'fixed';

export const DEFAULT_CONFIG: MatchConfig = {
  rounds: 5,
  rowSize: 5,
  // 11/13 out of a swept grid: +2 lands the first-picker win rate on 49.6% at
  // every HP level, and 11 is the value where the HP bar actually matters —
  // ~18% of matches end by knockout and the loser finishes around 3 HP.
  startHp: 11,
  secondPickerHpBonus: 2,
  damagePerPower: 1,
  // Uncapped, a bust hands over the full target as damage and 27% of matches
  // end by knockout. At 5 it is 14%, which is where `sum` sat.
  maxRoundDamage: 5,
  firstPickerRule: 'alternate',
  // Chosen by sweep, see D-21. Against `sum`, "closest to 11" drops a greedy
  // player from 50.0% to 23.2% while leaving seat fairness on 50.0% with the
  // HP compensation untouched — the rule started carrying its own weight
  // instead of leaning on the card set.
  rowRule: 'closest',
  rowTarget: 11,
  pickTimeoutMs: 20_000,
  reconnectGraceMs: 30_000,
};

export function withConfig(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
