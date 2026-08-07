import { useState } from 'react';
import { useT } from '../i18n/index.js';
import { CardView } from '../components/Card.js';
import { haptic, playSound } from '../audio.js';
import './tutorial.css';

/**
 * Three steps, under thirty seconds, and step two is interactive — the player
 * takes a real card before they are told what happens next. The whole game is
 * one verb, so the tutorial is mostly about making that verb feel consequential
 * rather than about explaining rules.
 */

const ROW = ['pyre-giant', 'wolf-pup', 'pack-leader', 'cog', 'shade'];
const TOTAL = 3;

export function TutorialScreen({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [taken, setTaken] = useState<string | null>(null);

  const next = () => {
    playSound('tap');
    if (step + 1 >= TOTAL) onDone();
    else setStep(step + 1);
  };

  return (
    <div className="screen tutorial">
      <div className="tutorial__head">
        <span className="tiny">{t('tutorial.step', { n: step + 1, total: TOTAL })}</span>
        <button type="button" className="btn btn--ghost btn--sm tutorial__skip" onClick={onDone}>
          {t('common.skip')}
        </button>
      </div>

      <div className="tutorial__dots">
        {Array.from({ length: TOTAL }, (_, i) => (
          <span key={i} className={`tutorial__dot ${i <= step ? 'is-on' : ''}`} />
        ))}
      </div>

      <div className="tutorial__body">
        <h2 className="tutorial__title">{t(`tutorial.s${step + 1}.title` as 'tutorial.s1.title')}</h2>
        <p className="tutorial__text">{t(`tutorial.s${step + 1}.body` as 'tutorial.s1.body')}</p>
      </div>

      <div className="tutorial__stage">
        {step === 0 && (
          <div className="tutorial__row">
            {ROW.slice(0, 3).map((id) => (
              <CardView key={id} cardId={id} size="battle" />
            ))}
          </div>
        )}

        {step === 1 && (
          <div className="tutorial__row">
            {ROW.slice(0, 3).map((id) => (
              <CardView
                key={id}
                cardId={id}
                size="battle"
                selected={taken === id}
                dimmed={taken !== null && taken !== id}
                onClick={
                  taken
                    ? undefined
                    : () => {
                        playSound('pick');
                        haptic([14, 30, 10]);
                        setTaken(id);
                      }
                }
              />
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="tutorial__fight">
            <div className="tutorial__fight-side">
              <CardView cardId="pyre-giant" size="battle" livePower={4} />
              <CardView cardId="wolf-pup" size="battle" livePower={2} />
              <span className="tutorial__sum">6</span>
            </div>
            <span className="tutorial__vs">×</span>
            <div className="tutorial__fight-side">
              <CardView cardId="pack-leader" size="battle" livePower={2} />
              <CardView cardId="cog" size="battle" livePower={1} />
              <span className="tutorial__sum tutorial__sum--lose">3</span>
            </div>
          </div>
        )}
      </div>

      <div className="tutorial__foot">
        {step === 1 && !taken ? (
          <div className="tutorial__prompt">{t('tutorial.tryIt')}</div>
        ) : (
          <button type="button" className="btn btn--primary" onClick={next}>
            {step + 1 >= TOTAL ? t('tutorial.done') : t('common.continue')}
          </button>
        )}
      </div>
    </div>
  );
}
