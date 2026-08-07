import { useEffect } from 'react';
import { other, type MatchState, type PlayerIndex } from '@delezh/engine';
import { useT } from '../i18n/index.js';
import { CardView } from '../components/Card.js';
import { playSound } from '../audio.js';
import './result.css';

export interface ResultScreenProps {
  state: MatchState;
  me: PlayerIndex;
  ratingDelta: number | null;
  onRematch: () => void;
  rematchPending: boolean;
  opponentWantsRematch?: boolean;
  opponentLeft?: boolean;
  onHome: () => void;
  /** True for bot games, where the rating deliberately does not move. */
  unranked: boolean;
}

export function ResultScreen({
  state,
  me,
  ratingDelta,
  onRematch,
  rematchPending,
  opponentWantsRematch = false,
  opponentLeft = false,
  onHome,
  unranked,
}: ResultScreenProps) {
  const t = useT();
  const won = state.winner === me;
  const draw = state.winner === null;

  useEffect(() => {
    playSound(draw ? 'reveal' : won ? 'win' : 'lose');
  }, [won, draw]);

  const headline = draw ? 'result.draw' : won ? 'result.victory' : 'result.defeat';
  const tone = draw ? 'tie' : won ? 'win' : 'loss';

  return (
    <div className="screen result">
      <div className={`result__banner result__banner--${tone}`}>{t(headline as 'result.victory')}</div>

      <div className="result__score">
        <Score label={t('common.you')} hp={state.players[me].hp} max={state.players[me].maxHp} />
        <span className="result__dash">—</span>
        <Score
          label={t('common.opponent')}
          hp={state.players[other(me)].hp}
          max={state.players[other(me)].maxHp}
        />
      </div>

      <div className="tiny result__rounds">
        {t('result.rounds', { won: state.players[me].roundsWon, total: state.config.rounds })}
      </div>

      <div className="result__rating tiny">
        {unranked
          ? t('result.botNoRating')
          : ratingDelta === null || ratingDelta === 0
            ? t('result.ratingSame')
            : ratingDelta > 0
              ? t('result.ratingUp', { delta: ratingDelta })
              : t('result.ratingDown', { delta: ratingDelta })}
      </div>

      <div className="result__deck">
        <div className="tiny muted">{t('match.yourCards')}</div>
        <div className="result__cards">
          {state.players[me].taken.map((card) => (
            <CardView key={card.uid} cardId={card.cardId} size="mini" />
          ))}
        </div>
      </div>

      <div className="stack result__actions">
        <button
          type="button"
          className="btn btn--primary"
          onClick={onRematch}
          disabled={rematchPending || opponentLeft}
        >
          {opponentLeft
            ? t('result.rematchDeclined')
            : rematchPending
              ? t('result.rematchWaiting')
              : opponentWantsRematch
                ? `${t('result.rematch')} · ${t('emote.rematch')}`
                : t('result.rematch')}
        </button>
        <button type="button" className="btn" onClick={onHome}>
          {t('result.home')}
        </button>
      </div>
    </div>
  );
}

function Score({ label, hp, max }: { label: string; hp: number; max: number }) {
  return (
    <div className="result__score-side">
      <div className="tiny muted">{label}</div>
      <div className="result__hp">{hp}</div>
      <div className="tiny muted">/{max}</div>
    </div>
  );
}
