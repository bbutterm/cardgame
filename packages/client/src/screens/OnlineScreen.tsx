import { useEffect, useState } from 'react';
import { CODE_LENGTH } from '@delezh/protocol';
import { useT } from '../i18n/index.js';
import { useOnlineMatch } from '../game/useOnlineMatch.js';
import { MatchScreen } from './MatchScreen.js';
import { ResultScreen } from './ResultScreen.js';
import { playSound } from '../audio.js';
import './online.css';

export interface OnlineScreenProps {
  /** Room code from an invite link (?room=ABCD). */
  joinCode?: string;
  onHome: () => void;
}

export function OnlineScreen({ joinCode, onHome }: OnlineScreenProps) {
  const t = useT();
  const { controller, stage, createRoom, joinRoom, startQueue, cancelQueue, leave, over } = useOnlineMatch();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [autoJoined, setAutoJoined] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Follow an invite link exactly once, after the socket has identified.
  useEffect(() => {
    if (joinCode && !autoJoined && stage.kind === 'idle') {
      setAutoJoined(true);
      joinRoom(joinCode);
    }
  }, [joinCode, autoJoined, stage.kind, joinRoom]);

  useEffect(() => {
    if (stage.kind !== 'queued') return;
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - stage.since) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [stage]);

  const goHome = () => {
    leave();
    onHome();
  };

  if (stage.kind === 'match' || controller.state) {
    if (controller.state?.phase === 'gameOver' && !controller.battle) {
      return (
        <ResultScreen
          state={controller.state}
          me={controller.me}
          ratingDelta={over?.ratingDelta ?? null}
          unranked={false}
          onRematch={controller.rematch}
          rematchPending={controller.rematchPending}
          onHome={goHome}
        />
      );
    }
    return <MatchScreen controller={controller} onExit={goHome} />;
  }

  const share = async (roomCode: string) => {
    const url = `${window.location.origin}/?room=${roomCode}`;
    try {
      if (navigator.share) await navigator.share({ title: t('app.title'), url });
      else await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* the user dismissed the share sheet */
    }
  };

  return (
    <div className="screen online">
      <header className="online__head">
        <button type="button" className="btn btn--sm online__back" onClick={goHome}>
          ← {t('common.back')}
        </button>
        <h2>{t('online.title')}</h2>
      </header>

      {stage.kind === 'connecting' && <div className="online__status muted">{t('common.loading')}</div>}

      {stage.kind === 'error' && (
        <div className="online__status online__status--error">
          {t(stage.message as 'error.generic')}
          <button type="button" className="btn btn--sm" onClick={() => window.location.reload()}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {stage.kind === 'queued' && (
        <div className="online__status">
          <div className="online__spinner" aria-hidden="true" />
          <div>{t('online.searching')}</div>
          <div className="tiny muted">{t('online.searchingTime', { seconds: elapsed })}</div>
          <button type="button" className="btn" onClick={cancelQueue}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      {stage.kind === 'room' && (
        <div className="online__room">
          <div className="tiny muted">{t('online.roomCode')}</div>
          <div className="online__code">{stage.room.code}</div>
          <div className="tiny muted">{t('online.shareHint')}</div>
          <button type="button" className="btn btn--primary" onClick={() => void share(stage.room.code)}>
            {copied ? t('online.linkCopied') : t('online.copyLink')}
          </button>
          <div className="online__waiting">
            <div className="online__spinner" aria-hidden="true" />
            {t('online.waitingOpponent')}
          </div>
          <button type="button" className="btn btn--ghost" onClick={goHome}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      {stage.kind === 'idle' && (
        <div className="stack online__menu">
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => {
              playSound('tap');
              startQueue();
            }}
          >
            {t('online.quickMatch')}
          </button>

          <button type="button" className="btn" onClick={createRoom}>
            {t('online.createRoom')}
          </button>

          <div className="online__join brut">
            <input
              className="online__input"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase().slice(0, CODE_LENGTH))}
              placeholder={t('online.enterCode')}
              maxLength={CODE_LENGTH}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              // Letters and digits, so the numeric keypad is wrong here; the
              // text keyboard with autocapitalise is the least-bad option.
              inputMode="text"
              aria-label={t('online.enterCode')}
            />
            <button
              type="button"
              className="btn btn--sm online__join-btn"
              disabled={code.length !== CODE_LENGTH}
              onClick={() => joinRoom(code)}
            >
              {t('online.joinRoom')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
