import { useState } from 'react';
import { LOCALES, useI18n } from '../i18n/index.js';
import { isHapticsEnabled, isSoundEnabled, playSound, setHapticsEnabled, setSoundEnabled } from '../audio.js';
import { loadProfile, updateProfile } from '../profile.js';
import { isExtendedEnabled, isExtendedUnlocked, setExtendedEnabled } from '../campaign.js';
import './settings.css';

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const [profile, setProfile] = useState(loadProfile);
  const [sound, setSound] = useState(isSoundEnabled);
  const [haptics, setHaptics] = useState(isHapticsEnabled);
  // Hidden entirely until the campaign is finished — a greyed-out row asking to
  // be earned is a nag, and the campaign screen already announces the reward.
  const [extendedUnlocked] = useState(isExtendedUnlocked);
  const [extended, setExtended] = useState(isExtendedEnabled);

  return (
    <div className="screen settings">
      <header className="settings__head">
        <button type="button" className="btn btn--sm btn--auto settings__back" onClick={onBack}>
          ← {t('common.back')}
        </button>
        <h2>{t('settings.title')}</h2>
      </header>

      <label className="settings__row brut">
        <span>{t('settings.nickname')}</span>
        <input
          className="settings__input"
          value={profile.name}
          maxLength={20}
          onChange={(event) => setProfile(updateProfile({ name: event.target.value }))}
        />
      </label>

      <div className="settings__row brut">
        <span>{t('settings.language')}</span>
        <div className="row">
          {LOCALES.map((code) => (
            <button
              type="button"
              key={code}
              className={`settings__pill ${code === locale ? 'is-on' : ''}`}
              onClick={() => setLocale(code)}
            >
              {code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <Toggle
        label={t('settings.sound')}
        on={sound}
        onLabel={t('settings.on')}
        offLabel={t('settings.off')}
        onToggle={() => {
          const next = !sound;
          setSoundEnabled(next);
          setSound(next);
          if (next) playSound('tap');
        }}
      />

      <Toggle
        label={t('settings.haptics')}
        on={haptics}
        onLabel={t('settings.on')}
        offLabel={t('settings.off')}
        onToggle={() => {
          const next = !haptics;
          setHapticsEnabled(next);
          setHaptics(next);
        }}
      />

      {extendedUnlocked && (
        <>
          <Toggle
            label={t('settings.extended')}
            on={extended}
            onLabel={t('settings.on')}
            offLabel={t('settings.off')}
            onToggle={() => {
              const next = !extended;
              setExtendedEnabled(next);
              setExtended(next);
              playSound('tap');
            }}
          />
          <p className="settings__hint tiny muted">{t('settings.extended.hint')}</p>
        </>
      )}
    </div>
  );
}

function Toggle({
  label,
  on,
  onLabel,
  offLabel,
  onToggle,
}: {
  label: string;
  on: boolean;
  onLabel: string;
  offLabel: string;
  onToggle: () => void;
}) {
  return (
    <button type="button" className="settings__row brut" onClick={onToggle} aria-pressed={on}>
      <span>{label}</span>
      <span className={`settings__pill ${on ? 'is-on' : ''}`}>{on ? onLabel : offLabel}</span>
    </button>
  );
}
