import { useState } from 'react';
import { CAMPAIGN, type Encounter } from '@delezh/cards';
import { useI18n } from '../i18n/index.js';
import { CardArt, COMPOSITION_COUNT } from '../art/procedural.js';
import { isComplete, isUnlocked, loadProgress, resetProgress } from '../campaign.js';
import { playSound } from '../audio.js';
import './campaign.css';

export interface CampaignScreenProps {
  onPlay: (encounter: Encounter) => void;
  onBack: () => void;
}

/**
 * Each opponent gets a portrait from the same generator the cards use, in the
 * colour of the faction their pool is built from. The composition is forced to
 * a different family per row so no two entries in the list look alike.
 */
const PORTRAIT_FACTION = ['neutral', 'beast', 'machine', 'fire', 'shadow', 'neutral', 'machine', 'shadow'] as const;

export function CampaignScreen({ onPlay, onBack }: CampaignScreenProps) {
  const { t, locale } = useI18n();
  const [progress, setProgress] = useState(loadProgress);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const done = progress.cleared.length;
  const finished = isComplete(progress);

  return (
    <div className="screen campaign">
      <header className="campaign__head">
        <button type="button" className="btn btn--sm btn--auto" onClick={onBack}>
          ← {t('common.back')}
        </button>
        <h2>{t('campaign.title')}</h2>
      </header>

      <div className="campaign__progress">
        <div className="campaign__bar">
          <div className="campaign__bar-fill" style={{ width: `${(done / CAMPAIGN.length) * 100}%` }} />
        </div>
        <span className="tiny">{t('campaign.progress', { done, total: CAMPAIGN.length })}</span>
      </div>

      {finished && (
        <div className="campaign__done">
          <span>{t('campaign.complete')}</span>
          <span className="tiny campaign__reward">{t('campaign.reward')}</span>
        </div>
      )}

      <ol className="campaign__list">
        {CAMPAIGN.map((encounter, index) => {
          const unlocked = isUnlocked(index, progress);
          const cleared = progress.cleared.includes(encounter.id);
          return (
            <li key={encounter.id}>
              <button
                type="button"
                className={`campaign__row ${cleared ? 'is-cleared' : ''} ${unlocked ? '' : 'is-locked'}`}
                disabled={!unlocked}
                onClick={() => {
                  playSound('tap');
                  onPlay(encounter);
                }}
              >
                <span className="campaign__portrait">
                  {unlocked ? (
                    <CardArt
                      cardId={`foe:${encounter.id}`}
                      faction={PORTRAIT_FACTION[index] ?? 'neutral'}
                      composition={index % COMPOSITION_COUNT}
                      className="campaign__portrait-svg"
                    />
                  ) : (
                    <span className="campaign__lock">🔒</span>
                  )}
                </span>

                <span className="campaign__info">
                  <span className="campaign__name">
                    {index + 1}. {unlocked ? encounter.name[locale] : t('campaign.locked')}
                  </span>
                  {unlocked && <span className="campaign__blurb tiny">{encounter.blurb[locale]}</span>}
                  {unlocked && encounter.twist[locale] && (
                    <span className="chip campaign__twist">{encounter.twist[locale]}</span>
                  )}
                </span>

                <span className="campaign__state">
                  {cleared ? (
                    <span className="campaign__tick" aria-label={t('campaign.cleared')}>
                      ✓
                    </span>
                  ) : (
                    <span className={`campaign__diff campaign__diff--${encounter.difficulty} tiny`}>
                      {t(`difficulty.${encounter.difficulty}` as 'difficulty.easy')}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      {done > 0 && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmingReset(true)}>
          {t('campaign.reset')}
        </button>
      )}

      {confirmingReset && (
        <div className="campaign__sheet" onClick={() => setConfirmingReset(false)}>
          <div className="brut campaign__sheet-inner" onClick={(event) => event.stopPropagation()}>
            <div className="campaign__question">{t('campaign.resetConfirm')}</div>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => {
                resetProgress();
                setProgress(loadProgress());
                setConfirmingReset(false);
              }}
            >
              {t('campaign.reset')}
            </button>
            <button type="button" className="btn" onClick={() => setConfirmingReset(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
