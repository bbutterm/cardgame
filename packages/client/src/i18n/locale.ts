import { LOCALES, type Locale } from '@delezh/cards';

export const LOCALE_STORAGE_KEY = 'delezh.locale';

/**
 * The player's language, outside of React.
 *
 * Lives apart from `I18nProvider` because things that are not components need
 * it too — the profile module generates a default nickname before any provider
 * has mounted, and importing the provider there would drag React into a plain
 * storage helper.
 */
export function detectLocale(): Locale {
  const known = (value: string): value is Locale => (LOCALES as readonly string[]).includes(value);

  // Guarded per-API rather than on `window`: storage and navigator are absent
  // independently of each other outside a browser, and a stored choice should
  // still win in an environment that has storage but no navigator.
  const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem(LOCALE_STORAGE_KEY);
  if (saved && known(saved)) return saved;

  if (typeof navigator !== 'undefined') {
    for (const tag of navigator.languages ?? [navigator.language]) {
      const base = tag.slice(0, 2).toLowerCase();
      if (known(base)) return base;
    }
  }
  // English rather than Russian: someone whose browser is set to neither is
  // likelier to read English than Cyrillic.
  return 'en';
}
