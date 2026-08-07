import { useEffect, useState } from 'react';
import { getCard } from '@delezh/cards';
import { other, type CardInstance } from '@delezh/engine';
import { useI18n } from '../i18n/index.js';
import type { MatchController } from '../game/types.js';
import { CardView } from '../components/Card.js';
import { CardSheet } from '../components/CardSheet.js';
import { HpBar } from '../components/HpBar.js';
import { OpenRow } from '../components/OpenRow.js';
import { RowTotal, projectedTotal, rowTotalOf } from '../components/RowTotal.js';
import { BattleOverlay } from '../components/BattleOverlay.js';
import { EmoteButton, EmoteStream } from '../components/EmoteBar.js';
import { haptic, playSound } from '../audio.js';
import './match.css';

export interface MatchScreenProps {
  controller: MatchController;
  onExit: () => void;
}

export function MatchScreen({ controller, onExit }: MatchScreenProps) {
  const { t, locale } = useI18n();
  const { state, me } = controller;
  const them = other(me);
  const [selected, setSelected] = useState<string | null>(null);
  const [peeking, setPeeking] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [confirmingExit, setConfirmingExit] = useState(false);

  // A pick that lands must not leave a stale selection highlighted.
  useEffect(() => setSelected(null), [state?.turnId]);

  if (!state) {
    return (
      <div className="screen center">
        <div className="muted">{t('common.loading')}</div>
      </div>
    );
  }

  const myPlayer = state.players[me];
  const theirPlayer = state.players[them];
  const meName = t('common.you');
  const themName = controller.opponentName ?? t('common.opponent');

  const confirm = (uid: string) => {
    if (!controller.canPick) return;
    playSound('pick');
    haptic([14, 30, 10]);
    controller.pick(uid);
    setSelected(null);
  };

  const selectedCard = selected ? state.open.find((slot) => slot?.uid === selected) : null;
  const seconds = controller.timeLeftMs !== null ? Math.ceil(controller.timeLeftMs / 1000) : null;
  const timerRatio =
    controller.timeLeftMs !== null ? Math.max(0, controller.timeLeftMs) / state.config.pickTimeoutMs : 0;

  const myTotal = rowTotalOf(myPlayer.row, theirPlayer.row);
  const theirTotal = rowTotalOf(theirPlayer.row, myPlayer.row);
  const myProjected = selectedCard ? projectedTotal(myPlayer.row, theirPlayer.row, selectedCard) : null;

  const nextRow = myPlayer.peekedRow !== null ? state.rows[myPlayer.peekedRow] : undefined;
  const canPeek = !!nextRow && nextRow.length > 0 && myPlayer.peekedRow! > state.round;
  const cardsLeft = state.open.filter((slot) => slot !== null).length;

  const turnLabel =
    controller.status === 'reconnecting'
      ? t('online.reconnecting')
      : controller.status === 'opponentAway'
        ? t('online.opponentDisconnected', { seconds: controller.reconnectSeconds ?? 0 })
        : controller.canPick
          ? `${t('match.yourTurn')}${seconds !== null ? ` · ${seconds}` : ''}`
          : // The opponent's clock is theirs, but it is still running, and a
            // player waiting on a silent board cannot tell thinking from gone.
            seconds !== null
            ? t('match.opponentThinking', { seconds })
            : t('match.opponentTurn');

  return (
    <div className="match">
      <header className="match__top">
        <button
          type="button"
          className="match__exit"
          onClick={() => setConfirmingExit(true)}
          aria-label={t('match.leave')}
        >
          ✕
        </button>
        <div className="match__round tiny">
          {t('match.round', { round: state.round + 1, total: state.config.rounds })}
        </div>
        <div className="match__left tiny">{t('match.cardsLeft', { n: cardsLeft })}</div>
      </header>

      {/* The bar runs on whoever's clock is live, dimmed when it is not yours. */}
      <div className={`match__timer ${controller.canPick ? '' : 'is-theirs'}`}>
        <div
          className={`match__timer-fill ${timerRatio < 0.3 ? 'is-urgent' : ''}`}
          style={{ width: `${seconds !== null ? timerRatio * 100 : 0}%` }}
        />
      </div>

      <section className="match__side match__side--them">
        <HpBar label={themName} hp={theirPlayer.hp} maxHp={theirPlayer.maxHp} mirrored compact />
        <div className="match__strip">
          <TakenStrip cards={theirPlayer.row} empty={t('match.theirCards')} onRead={setReading} />
          <RowTotal total={theirTotal} label={t('match.rowTotal')} align="end" />
        </div>
      </section>

      <div className="match__board">
        <EmoteStream emotes={controller.emotes} me={me} />

        <div className={`match__turn ${controller.canPick ? 'is-mine' : ''}`}>{turnLabel}</div>

        <OpenRow
          slots={state.open}
          selectedUid={selected}
          onSelect={setSelected}
          onConfirm={confirm}
          onRead={setReading}
          interactive={controller.canPick}
        />

        {controller.flash && <div className="match__flash chip">{t(controller.flash as 'error.generic')}</div>}

        {/* The long press is the only way to read a clamped card, and an
            affordance nobody is told about does not exist. Shown in row 1 only. */}
        {state.round === 0 && controller.notices.length === 0 && !selectedCard && (
          <div className="match__hint tiny">{t('match.tapToRead')}</div>
        )}

        {controller.notices.length > 0 && (
          <div className="match__notices">
            {controller.notices.map((notice, index) => (
              <span className="chip" key={index}>
                {notice.t === 'skip' && t('match.skipped')}
                {notice.t === 'extraPick' && t('match.extraPick')}
                {notice.t === 'peek' && t('match.peeked')}
                {notice.t === 'pick' && t('match.autoPick')}
              </span>
            ))}
          </div>
        )}
      </div>

      <section className="match__side match__side--me">
        <div className="match__strip">
          <TakenStrip cards={myPlayer.row} empty={t('match.yourCards')} onRead={setReading} />
          <RowTotal total={myTotal} projected={myProjected} label={t('match.rowTotal')} align="end" />
        </div>
        <div className="match__bottom">
          <HpBar label={meName} hp={myPlayer.hp} maxHp={myPlayer.maxHp} compact />
          {canPeek && (
            <button type="button" className="btn btn--sm btn--auto match__peek" onClick={() => setPeeking(true)}>
              👁
            </button>
          )}
          <EmoteButton onSend={controller.sendEmote} />
        </div>
      </section>

      {selectedCard && controller.canPick && (
        <div className="match__confirm">
          <div className="match__confirm-info">
            <div className="match__confirm-name">{getCard(selectedCard.cardId).name[locale]}</div>
            <div className="match__confirm-text tiny">
              {getCard(selectedCard.cardId).text[locale] || t('match.tapToPick')}
            </div>
            {myProjected !== null && (
              <RowTotal total={myTotal} projected={myProjected} label={t('match.rowTotal')} />
            )}
          </div>
          <button
            type="button"
            className="btn btn--primary btn--auto match__confirm-btn"
            onClick={() => confirm(selectedCard.uid)}
          >
            {t('match.take')}
          </button>
        </div>
      )}

      {reading && <CardSheet cardId={reading} onClose={() => setReading(null)} />}

      {peeking && nextRow && (
        <div className="match__sheet" onClick={() => setPeeking(false)}>
          <div className="brut match__sheet-inner" onClick={(event) => event.stopPropagation()}>
            <div className="tiny">{t('match.nextRow')}</div>
            <div className="match__peek-cards">
              {nextRow.map((card: CardInstance) => (
                <CardView key={card.uid} cardId={card.cardId} size="battle" />
              ))}
            </div>
            <button type="button" className="btn" onClick={() => setPeeking(false)}>
              {t('common.close')}
            </button>
          </div>
        </div>
      )}

      {confirmingExit && (
        <div className="match__sheet" onClick={() => setConfirmingExit(false)}>
          <div className="brut match__sheet-inner" onClick={(event) => event.stopPropagation()}>
            {/* Leaving forfeits a ranked match, so it cannot be one stray tap. */}
            <div className="match__question">{t('match.leaveConfirm')}</div>
            <button type="button" className="btn btn--danger" onClick={onExit}>
              {t('match.leave')}
            </button>
            <button type="button" className="btn" onClick={() => setConfirmingExit(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {controller.battle && (
        <BattleOverlay
          // The overlay's reveal step is component state; without a key a second
          // battle re-renders the same instance already past its last step and
          // shows the outcome with no animation at all.
          key={controller.battle.round}
          result={controller.battle}
          me={me}
          meName={meName}
          themName={themName}
          maxHp={[state.players[0].maxHp, state.players[1].maxHp]}
          onDone={controller.dismissBattle}
        />
      )}
    </div>
  );
}

/** The cards a side has taken in the current row. Tapping one reads it. */
function TakenStrip({
  cards,
  empty,
  onRead,
}: {
  cards: CardInstance[];
  empty: string;
  onRead: (cardId: string) => void;
}) {
  if (cards.length === 0) {
    return <div className="match__taken match__taken--empty tiny">{empty}</div>;
  }
  return (
    <div className="match__taken">
      {cards.map((card) => (
        <CardView key={card.uid} cardId={card.cardId} size="mini" onClick={() => onRead(card.cardId)} />
      ))}
    </div>
  );
}
