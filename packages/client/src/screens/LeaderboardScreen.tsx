import { useEffect, useState } from 'react';
import type { LeaderboardRow } from '@delezh/protocol';
import { useT } from '../i18n/index.js';
import { loadProfile } from '../profile.js';
import './leaderboard.css';

export function LeaderboardScreen({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [rows, setRows] = useState<LeaderboardRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const me = loadProfile();

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/leaderboard', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((data: LeaderboardRow[]) => setRows(data))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setFailed(true);
      });
    return () => controller.abort();
  }, []);

  return (
    <div className="screen leaderboard">
      <header className="leaderboard__head">
        <button type="button" className="btn btn--sm leaderboard__back" onClick={onBack}>
          ← {t('common.back')}
        </button>
        <h2>{t('leaderboard.title')}</h2>
      </header>

      {failed && <div className="leaderboard__empty muted">{t('error.offline')}</div>}
      {!failed && rows === null && <div className="leaderboard__empty muted">{t('common.loading')}</div>}
      {rows !== null && rows.length === 0 && <div className="leaderboard__empty muted">{t('leaderboard.empty')}</div>}

      {rows !== null && rows.length > 0 && (
        <div className="leaderboard__table brut">
          <div className="leaderboard__row leaderboard__row--head tiny">
            <span className="leaderboard__rank">{t('leaderboard.rank')}</span>
            <span className="leaderboard__name">{t('leaderboard.player')}</span>
            <span className="leaderboard__games">{t('leaderboard.games')}</span>
            <span className="leaderboard__rating">{t('leaderboard.rating')}</span>
          </div>
          {rows.map((row) => (
            <div className={`leaderboard__row ${row.id === me.id ? 'is-me' : ''}`} key={row.id}>
              <span className="leaderboard__rank">{row.rank}</span>
              <span className="leaderboard__name">
                {row.name}
                {row.id === me.id && <span className="leaderboard__you tiny"> · {t('leaderboard.you')}</span>}
              </span>
              <span className="leaderboard__games">{row.games}</span>
              <span className="leaderboard__rating">{row.rating}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
