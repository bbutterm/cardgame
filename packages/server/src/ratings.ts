import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DEFAULT_RATING, eloDelta, type Outcome } from '@delezh/engine';
import type { LeaderboardRow } from '@delezh/protocol';

export interface PlayerRecord {
  id: string;
  name: string;
  rating: number;
  games: number;
  wins: number;
  updatedAt: number;
}

/**
 * Storage boundary for ratings.
 *
 * Everything the server does with ratings goes through this interface, so
 * swapping the file-backed store for Postgres later is one class, not a
 * refactor. The ELO maths itself lives in the engine and is shared with the
 * client so it can preview a delta.
 */
export interface RatingRepository {
  get(id: string): Promise<PlayerRecord | undefined>;
  /** Creates the record at the default rating if it does not exist yet. */
  ensure(id: string, name: string): Promise<PlayerRecord>;
  save(record: PlayerRecord): Promise<void>;
  /** `viewerId` only marks the requester's own row; ids are never returned. */
  top(limit: number, viewerId?: string): Promise<LeaderboardRow[]>;
}

export class InMemoryRatingRepository implements RatingRepository {
  protected readonly players = new Map<string, PlayerRecord>();

  async get(id: string): Promise<PlayerRecord | undefined> {
    return this.players.get(id);
  }

  async ensure(id: string, name: string): Promise<PlayerRecord> {
    const existing = this.players.get(id);
    if (existing) {
      if (name && existing.name !== name) {
        existing.name = name;
        await this.save(existing);
      }
      return existing;
    }
    const created: PlayerRecord = {
      id,
      name: name || 'Player',
      rating: DEFAULT_RATING,
      games: 0,
      wins: 0,
      updatedAt: Date.now(),
    };
    this.players.set(id, created);
    await this.save(created);
    return created;
  }

  async save(record: PlayerRecord): Promise<void> {
    record.updatedAt = Date.now();
    this.players.set(record.id, record);
  }

  async top(limit: number, viewerId?: string): Promise<LeaderboardRow[]> {
    return [...this.players.values()]
      .filter((player) => player.games > 0)
      .sort((a, b) => b.rating - a.rating || b.games - a.games)
      .slice(0, limit)
      .map((player, index) => {
        const row: LeaderboardRow = {
          rank: index + 1,
          name: player.name,
          rating: player.rating,
          games: player.games,
          wins: player.wins,
        };
        // The player id is the entire authentication story — `identify` accepts
        // whatever id it is handed — so publishing it on an unauthenticated
        // endpoint would hand out the top players' accounts.
        if (viewerId !== undefined && player.id === viewerId) row.isYou = true;
        return row;
      });
  }
}

/**
 * JSON-file store. Adequate for a single-node deployment and trivial to inspect
 * during development. Writes go through a temp file + rename so a crash mid-write
 * cannot leave a truncated leaderboard behind.
 */
export class FileRatingRepository extends InMemoryRatingRepository {
  private dirty = false;
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(private readonly path: string) {
    super();
    this.load();
  }

  private load(): void {
    if (!existsSync(this.path)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.path, 'utf8')) as PlayerRecord[];
      for (const record of parsed) this.players.set(record.id, record);
    } catch (error) {
      console.error(`[ratings] could not read ${this.path}, starting empty:`, error);
    }
  }

  override async save(record: PlayerRecord): Promise<void> {
    await super.save(record);
    this.dirty = true;
    // Coalesce writes: a match end touches two records back to back.
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        this.flush();
      }, 250);
      this.flushTimer.unref?.();
    }
  }

  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const temp = `${this.path}.tmp`;
      writeFileSync(temp, JSON.stringify([...this.players.values()], null, 2));
      renameSync(temp, this.path);
    } catch (error) {
      console.error('[ratings] write failed:', error);
    }
  }
}

export function createRatingRepository(): RatingRepository {
  const path = process.env.RATINGS_PATH ?? join(process.cwd(), 'data', 'ratings.json');
  if (path === ':memory:') return new InMemoryRatingRepository();
  return new FileRatingRepository(path);
}

export interface ScoredMatch {
  deltas: [number, number];
  ratings: [number, number];
}

/** Applies one match result to both players and persists it. */
export async function scoreMatch(
  repo: RatingRepository,
  a: PlayerRecord,
  b: PlayerRecord,
  outcomeForA: Outcome,
): Promise<ScoredMatch> {
  const outcomeForB: Outcome = outcomeForA === 'win' ? 'loss' : outcomeForA === 'loss' ? 'win' : 'draw';

  // Both deltas are computed from the pre-match ratings, otherwise the second
  // player would be scored against a rating that has already moved.
  const deltaA = eloDelta({ rating: a.rating, gamesPlayed: a.games }, { rating: b.rating, gamesPlayed: b.games }, outcomeForA);
  const deltaB = eloDelta({ rating: b.rating, gamesPlayed: b.games }, { rating: a.rating, gamesPlayed: a.games }, outcomeForB);

  a.rating = Math.max(100, a.rating + deltaA);
  b.rating = Math.max(100, b.rating + deltaB);
  a.games += 1;
  b.games += 1;
  if (outcomeForA === 'win') a.wins += 1;
  if (outcomeForB === 'win') b.wins += 1;

  await repo.save(a);
  await repo.save(b);

  return { deltas: [deltaA, deltaB], ratings: [a.rating, b.rating] };
}
