import { DEFAULT_RATING } from '@delezh/engine';
import type { Locale } from '@delezh/cards';
import { detectLocale } from './i18n/locale.js';

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

/**
 * The default nickname, per language.
 *
 * Not in the message dictionaries: these are word lists a generator draws from,
 * not strings a screen renders, and `t()` has no way to say "one of these five".
 * The nouns are the game's own creatures on purpose — a fresh player's name
 * should sound like it came from the card set.
 *
 * The name is generated once and stored, so this is the one string in the app
 * that a later language switch cannot retranslate: it becomes *the player's*
 * name the moment it is written, and renaming someone behind their back because
 * they tapped EN would be worse than the mismatch.
 */
const NAME_WORDS: Record<Locale, { adjectives: string[]; nouns: string[] }> = {
  ru: {
    adjectives: ['Быстрый', 'Тихий', 'Хитрый', 'Дерзкий', 'Ловкий'],
    nouns: ['Волк', 'Уголёк', 'Клинок', 'Дрон', 'Идол'],
  },
  en: {
    adjectives: ['Swift', 'Quiet', 'Sly', 'Bold', 'Nimble'],
    nouns: ['Wolf', 'Ember', 'Blade', 'Drone', 'Idol'],
  },
};

function randomName(locale: Locale = detectLocale()): string {
  const words = NAME_WORDS[locale];
  const a = words.adjectives[Math.floor(Math.random() * words.adjectives.length)];
  const b = words.nouns[Math.floor(Math.random() * words.nouns.length)];
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
