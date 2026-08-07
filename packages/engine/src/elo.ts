/** Standard ELO. Lives in the engine so client and server agree on previews. */

export const DEFAULT_RATING = 1000;

/** K-factor decays as a player settles, so new accounts converge quickly. */
export function kFactor(gamesPlayed: number, rating: number): number {
  if (gamesPlayed < 10) return 48;
  if (rating >= 1600) return 16;
  return 24;
}

export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

export type Outcome = 'win' | 'loss' | 'draw';

export function scoreOf(outcome: Outcome): number {
  return outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
}

export interface EloInput {
  rating: number;
  gamesPlayed: number;
}

/** Returns the signed rating delta, rounded to a whole point. */
export function eloDelta(player: EloInput, opponent: EloInput, outcome: Outcome): number {
  const k = kFactor(player.gamesPlayed, player.rating);
  const delta = k * (scoreOf(outcome) - expectedScore(player.rating, opponent.rating));
  const rounded = Math.round(delta);
  // Never let a win round down to zero — a win must always feel like progress.
  if (outcome === 'win' && rounded <= 0) return 1;
  if (outcome === 'loss' && rounded >= 0) return -1;
  return rounded;
}
