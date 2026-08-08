import { useState } from 'react';
import type { BotLevel } from '@delezh/bot';
import { CAMPAIGN } from '@delezh/cards';
import { useI18n, LOCALES } from '../i18n/index.js';
import { loadProgress } from '../campaign.js';
import { playSound } from '../audio.js';
import { loadProfile } from '../profile.js';
import './home.css';

export interface HomeScreenProps {
  onPlayBot: (level: BotLevel) => void;
  onCampaign: () => void;
  onPlayOnline: () => void;
  onTutorial: () => void;
  onLeaderboard: () => void;
  onSettings: () => void;
}

const LEVELS: BotLevel[] = ['easy', 'normal', 'hard'];

export function HomeScreen({
  onPlayBot,
  onCampaign,
  onPlayOnline,
  onTutorial,
  onLeaderboard,
  onSettings,
}: HomeScreenProps) {
  const { t, locale, setLocale } = useI18n();
  const [choosing, setChoosing] = useState(false);
  const profile = loadProfile();
  const campaignDone = loadProgress().cleared.length;

  return (
    <div className="screen home">
      <div className="home__lang">
        {LOCALES.map((code) => (
          <button
            type="button"
            key={code}
            className={`home__lang-btn ${code === locale ? 'is-on' : ''}`}
            onClick={() => {
              playSound('tap');
              setLocale(code);
            }}
          >
            {code.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="home__hero">
        <h1 className="home__title">{t('app.title')}</h1>
        <p className="home__tagline">{t('app.tagline')}</p>
      </div>

      <div className="home__actions stack">
        {choosing ? (
          <>
            <div className="tiny home__section">{t('difficulty.title')}</div>
            {LEVELS.map((level) => (
              <button
                type="button"
                key={level}
                className="btn home__level"
                onClick={() => {
                  playSound('tap');
                  onPlayBot(level);
                }}
              >
                <span>{t(`difficulty.${level}` as 'difficulty.easy')}</span>
                <span className="tiny muted home__level-hint">
                  {t(`difficulty.${level}.hint` as 'difficulty.easy.hint')}
                </span>
              </button>
            ))}
            <button type="button" className="btn btn--ghost" onClick={() => setChoosing(false)}>
              {t('common.back')}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                playSound('tap');
                setChoosing(true);
              }}
            >
              {t('home.playBot')}
            </button>
            <button type="button" className="btn" onClick={onCampaign}>
              {t('home.campaign')}
              {campaignDone > 0 && (
                <span className="chip home__badge">
                  {campaignDone}/{CAMPAIGN.length}
                </span>
              )}
            </button>
            <button type="button" className="btn" onClick={onPlayOnline}>
              {t('home.playOnline')}
            </button>
            <button type="button" className="btn" onClick={onTutorial}>
              {t('home.tutorial')}
            </button>
            <div className="row">
              <button type="button" className="btn btn--sm" onClick={onLeaderboard}>
                {t('home.leaderboard')}
              </button>
              <button type="button" className="btn btn--sm" onClick={onSettings}>
                {t('home.settings')}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="home__footer tiny">
        {profile.name} · {t('home.rating')} {profile.rating}
      </div>
    </div>
  );
}
