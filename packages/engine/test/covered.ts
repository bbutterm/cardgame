import type { EffectKind } from '@delezh/cards';

/**
 * Which test file proves which effect kind works. coverage.test.ts asserts that
 * the union of these two lists equals the whole `Effect` union, so a new effect
 * cannot be added without landing in one of the two suites.
 */

/** Resolved inside resolveBattle — see effects.test.ts. */
export const COVERED_IN_BATTLE: EffectKind[] = [
  'powerIf',
  'powerPer',
  'weaken',
  'shield',
  'heal',
  'burn',
  'mirrorStrongest',
  'lonerBonus',
];

/** Only observable across turns — see match.test.ts. */
export const COVERED_IN_MATCH: EffectKind[] = [
  'skipNextPick',
  'extraPick',
  'firstPickerSelf',
  'revealNextRow',
];
