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
  /** Pick timer in ms. The host enforces it; the engine only stores it. */
  pickTimeoutMs: number;
  /** Grace period for reconnecting into a live match, in ms. */
  reconnectGraceMs: number;
}

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
  maxRoundDamage: 0,
  firstPickerRule: 'alternate',
  pickTimeoutMs: 20_000,
  reconnectGraceMs: 30_000,
};

export function withConfig(overrides: Partial<MatchConfig> = {}): MatchConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}
