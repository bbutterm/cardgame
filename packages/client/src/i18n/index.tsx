import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { LOCALES, type Locale } from '@delezh/cards';
import { ru, type MessageKey } from './ru.js';
import { en } from './en.js';

const DICTIONARIES: Record<Locale, Record<MessageKey, string>> = { ru, en };

const STORAGE_KEY = 'delezh.locale';

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'ru';
  const saved = window.localStorage.getItem(STORAGE_KEY);
  if (saved && (LOCALES as readonly string[]).includes(saved)) return saved as Locale;
  const preferred = window.navigator.languages ?? [window.navigator.language];
  for (const tag of preferred) {
    const base = tag.slice(0, 2).toLowerCase();
    if ((LOCALES as readonly string[]).includes(base)) return base as Locale;
  }
  return 'en';
}

export type Vars = Record<string, string | number>;

function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

export interface I18n {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => setLocaleState(next), []);

  const t = useCallback(
    (key: MessageKey, vars?: Vars) => format(DICTIONARIES[locale][key] ?? ru[key] ?? key, vars),
    [locale],
  );

  const value = useMemo<I18n>(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n outside I18nProvider');
  return context;
}

/** Shorthand for components that only need the translate function. */
export function useT(): I18n['t'] {
  return useI18n().t;
}

export type { MessageKey, Locale };
export { LOCALES };
