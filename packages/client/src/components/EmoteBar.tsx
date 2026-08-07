import { useState } from 'react';
import type { PlayerIndex } from '@delezh/engine';
import { useT, type MessageKey } from '../i18n/index.js';
import type { EmoteMessage } from '../game/types.js';
import { haptic, playSound } from '../audio.js';
import './emote.css';

/** Eight quick lines. Enough to be expressive, few enough to fit one sheet. */
export const EMOTE_KEYS = [
  'emote.gg',
  'emote.nice',
  'emote.wow',
  'emote.thinking',
  'emote.hurry',
  'emote.oops',
  'emote.sorry',
  'emote.rematch',
] as const satisfies readonly MessageKey[];

const EMOJI: Record<string, string> = {
  'emote.gg': '🤝',
  'emote.nice': '🔥',
  'emote.wow': '😮',
  'emote.thinking': '🤔',
  'emote.hurry': '⏳',
  'emote.oops': '😅',
  'emote.sorry': '🙏',
  'emote.rematch': '🔁',
};

export function EmoteButton({ onSend }: { onSend: (key: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="emote__toggle"
        onClick={() => {
          playSound('tap');
          setOpen((value) => !value);
        }}
        aria-label={t('emote.gg')}
        aria-expanded={open}
      >
        💬
      </button>

      {open && (
        <>
          <div className="emote__scrim" onClick={() => setOpen(false)} />
          <div className="emote__sheet brut" role="menu">
            {EMOTE_KEYS.map((key) => (
              <button
                type="button"
                className="emote__option"
                key={key}
                role="menuitem"
                onClick={() => {
                  playSound('emote');
                  haptic(10);
                  onSend(key);
                  setOpen(false);
                }}
              >
                <span className="emote__emoji">{EMOJI[key]}</span>
                <span className="emote__label">{t(key)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export function EmoteStream({ emotes, me }: { emotes: EmoteMessage[]; me: PlayerIndex }) {
  const t = useT();
  return (
    <div className="emote__stream" aria-live="polite">
      {emotes.map((emote) => (
        <div
          key={emote.id}
          className={`emote__bubble ${emote.from === me ? 'is-mine' : 'is-theirs'}`}
        >
          <span className="emote__emoji">{EMOJI[emote.key]}</span>
          {t(emote.key as MessageKey)}
        </div>
      ))}
    </div>
  );
}
