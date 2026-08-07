import type { CardDef } from './types.js';

/**
 * Cards that survived the experimental balance pass.
 *
 * Everything here was proposed, simulated over 2000+ bot-vs-bot matches and kept
 * only if its win-rate landed inside the 42–58% corridor. Rejected designs and
 * the reasoning behind each verdict live in EXPERIMENTS.md.
 */
export const EXPERIMENTAL_CARDS: readonly CardDef[] = [];
