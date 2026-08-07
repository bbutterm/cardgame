import { DEFAULT_RATING } from '@delezh/engine';

/**
 * Local player identity.
 *
 * The client owns the display name and a cached rating for the menu; the server
 * owns the authoritative rating and recomputes it after every ranked match. The
 * cached value is only ever a display convenience — it is overwritten by
 * whatever the server reports at the end of a match.
 */
export interface Profile {
  /** Stable per-device id, used to reclaim a rating after a reinstall. */
  id: string;
  name: string;
  rating: number;
}

const KEY = 'delezh.profile';

const ADJECTIVES = ['Быстрый', 'Тихий', 'Хитрый', 'Дерзкий', 'Ловкий'];
const NOUNS = ['Волк', 'Уголёк', 'Клинок', 'Дрон', 'Идол'];

function randomName(): string {
  const a = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const b = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${a} ${b}`;
}

function randomId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function loadProfile(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Profile>;
      if (parsed.id && parsed.name) {
        return { id: parsed.id, name: parsed.name, rating: parsed.rating ?? DEFAULT_RATING };
      }
    }
  } catch {
    /* corrupt storage is not worth failing a launch over */
  }
  const fresh: Profile = { id: randomId(), name: randomName(), rating: DEFAULT_RATING };
  saveProfile(fresh);
  return fresh;
}

export function saveProfile(profile: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* private mode; the session still works, it just will not persist */
  }
}

export function updateProfile(patch: Partial<Profile>): Profile {
  const next = { ...loadProfile(), ...patch };
  saveProfile(next);
  return next;
}
