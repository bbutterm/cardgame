import { CAMPAIGN } from '@delezh/cards';

/**
 * Campaign progress, on the device.
 *
 * Deliberately not on the server: the campaign is single-player, works offline,
 * and moves no rating. Putting it behind an account would mean a player cannot
 * start it on a plane, which is the one place this mode is obviously for.
 */

const KEY = 'delezh.campaign';
const EXTENDED_KEY = 'delezh.extendedSet';

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

/**
 * Finishing the campaign unlocks the experimental cards in free bot matches.
 *
 * They already exist and are already balanced individually (EXPERIMENTS.md);
 * what kept them out of the default set is D-16 — as a *set* they push the
 * first picker from 49.8% to 52.5%. So the reward is deliberately scoped to the
 * one mode where that does not matter: offline, unranked, against a bot. Online
 * and the campaign itself always deal from the base 30, whatever this says.
 *
 * The unlock is checked on read rather than latched at completion, so pressing
 * "start over" puts the extra cards away too — a player who resets to replay the
 * ramp should get the ramp they had, not a wider pool with the same opponents.
 */
export function isExtendedUnlocked(): boolean {
  return isComplete(loadProgress());
}

export function isExtendedEnabled(): boolean {
  if (!isExtendedUnlocked()) return false;
  try {
    return localStorage.getItem(EXTENDED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setExtendedEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(EXTENDED_KEY, '1');
    else localStorage.removeItem(EXTENDED_KEY);
  } catch {
    /* private mode; the toggle still reads back false, which is honest */
  }
}
