import { CAMPAIGN } from '@delezh/cards';

/**
 * Campaign progress, on the device.
 *
 * Deliberately not on the server: the campaign is single-player, works offline,
 * and moves no rating. Putting it behind an account would mean a player cannot
 * start it on a plane, which is the one place this mode is obviously for.
 */

const KEY = 'delezh.campaign';

export interface CampaignProgress {
  /** Encounter ids that have been beaten. */
  cleared: string[];
}

export function loadProgress(): CampaignProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<CampaignProgress>;
      if (Array.isArray(parsed.cleared)) {
        // Drop ids from a campaign revision that no longer has them.
        const known = new Set(CAMPAIGN.map((e) => e.id));
        return { cleared: parsed.cleared.filter((id) => known.has(id)) };
      }
    }
  } catch {
    /* corrupt storage is not worth failing a launch over */
  }
  return { cleared: [] };
}

export function markCleared(id: string): CampaignProgress {
  const progress = loadProgress();
  if (!progress.cleared.includes(id)) progress.cleared.push(id);
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* private mode; the run still works, it just will not persist */
  }
  return progress;
}

export function resetProgress(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing to do */
  }
}

/**
 * An encounter is open if it is the first, or the one before it is cleared.
 *
 * Strictly linear, and one step of lookahead is all: a player who is stuck on
 * encounter 5 can see 6 exists but cannot skip to it. A grid where everything
 * unlocks at once would make the difficulty ramp meaningless.
 */
export function isUnlocked(index: number, progress: CampaignProgress): boolean {
  if (index === 0) return true;
  const previous = CAMPAIGN[index - 1];
  return !!previous && progress.cleared.includes(previous.id);
}

export function nextEncounterIndex(progress: CampaignProgress): number {
  const index = CAMPAIGN.findIndex((e) => !progress.cleared.includes(e.id));
  return index === -1 ? CAMPAIGN.length - 1 : index;
}

export function isComplete(progress: CampaignProgress): boolean {
  return CAMPAIGN.every((e) => progress.cleared.includes(e.id));
}
