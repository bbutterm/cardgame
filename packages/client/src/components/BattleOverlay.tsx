import { useEffect, useMemo, useState } from 'react';
import { other, rowVerdict, type MatchConfig, type PlayerIndex, type RoundResult } from '@delezh/engine';
import { useT } from '../i18n/index.js';
import { CardView } from './Card.js';
import { HpBar } from './HpBar.js';
import { playSound } from '../audio.js';
import './battle.css';

export interface BattleOverlayProps {
  result: RoundResult;
  me: PlayerIndex;
  meName: string;
  themName: string;
  maxHp: [number, number];
  /** Needed to explain the row: the target and the damage cap live here. */
  config: MatchConfig;
  onDone: () => void;
}

/**
 * The auto-battle, played back from the engine's RoundResult.
 *
 * The engine has already decided everything; this only paces the reveal so a
 * player can see *why* they won or lost — which card contributed what, where
 * the synergy bonus came from, and how the totals compared. Tapping anywhere
 * jumps to the end, because on the tenth match nobody wants the full four
 * seconds.
 */

const STEP_MS = 340;
const TOTALS_MS = 620;
const DAMAGE_MS = 900;

export function BattleOverlay({ result, me, meName, themName, maxHp, config, onDone }: BattleOverlayProps) {
  // Derived by the engine, not re-derived here: the overlay's job is to explain
  // the resolver, so it must not hold a second opinion about what happened.
  const scored = rowVerdict(result.raw, result.power, config);
  const target = config.rowRule === 'closest' ? config.rowTarget : null;
  const t = useT();
  const them = other(me);

  // Cards are revealed opponent-first, then yours, so the last thing on screen
  // before the totals is your own side.
  const sequence = useMemo(
    () => [
      ...result.lines[them].map((line) => ({ side: them, uid: line.uid })),
      ...result.lines[me].map((line) => ({ side: me, uid: line.uid })),
    ],
    [result, me, them],
  );

  const totalSteps = sequence.length + 3;
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (step >= totalSteps) return;
    const delay = step < sequence.length ? STEP_MS : step === sequence.length ? TOTALS_MS : DAMAGE_MS;
    const timer = window.setTimeout(() => setStep((s) => s + 1), delay);
    return () => window.clearTimeout(timer);
  }, [step, totalSteps, sequence.length]);

  useEffect(() => {
    if (step > 0 && step <= sequence.length) playSound('reveal');
    if (step === sequence.length + 1) playSound('clash');
    if (step === sequence.length + 2) {
      playSound(result.winner === me ? 'win' : result.winner === null ? 'reveal' : 'hurt');
    }
  }, [step, sequence.length, result.winner, me]);

  const revealed = Math.min(step, sequence.length);
  const showTotals = step > sequence.length;
  const showDamage = step > sequence.length + 1;
  const finished = step >= totalSteps;

  const revealedUids = useMemo(
    () => new Set(sequence.slice(0, revealed).map((entry) => entry.uid)),
    [sequence, revealed],
  );
  const activeUid = revealed > 0 && revealed <= sequence.length ? sequence[revealed - 1]?.uid : undefined;

  /** Sum of the cards revealed so far on one side. */
  const runningOf = (side: PlayerIndex) =>
    result.lines[side].reduce((sum, line) => (revealedUids.has(line.uid) ? sum + line.total : sum), 0);

  const skip = () => (finished ? onDone() : setStep(totalSteps));

  const verdict =
    result.winner === null ? 'battle.roundTie' : result.winner === me ? 'battle.roundWin' : 'battle.roundLoss';

  return (
    <div
      className="battle"
      role="dialog"
      aria-modal="true"
      onClick={skip}
      onTouchStart={(event) => {
        // Prevents the tap that skips from also landing on the card underneath.
        event.stopPropagation();
      }}
    >
      <div className="battle__inner">
        <div className="battle__title">{t('battle.title')}</div>

        <BattleSide
          lines={result.lines[them]}
          revealed={revealedUids}
          activeUid={activeUid}
          name={themName}
          total={result.power[them]}
          raw={result.raw[them]}
          weakenedBy={result.weaken[me]}
          showTotal={showTotals}
          target={target}
          busted={scored.busted[them]}
        />

        {/*
          Counts up with the reveal rather than sitting on "?" while the side
          headings already show a running total — two numbers for the same thing,
          one of them a question mark, was the confusing part.
        */}
        <div className={`battle__vs ${showTotals ? 'is-on' : ''}`}>
          <span className={`battle__vs-num ${scored.busted[them] ? 'is-bust' : ''}`}>
            {showTotals ? result.power[them] : runningOf(them)}
          </span>
          <span className="battle__vs-x">×</span>
          <span className={`battle__vs-num ${scored.busted[me] ? 'is-bust' : ''}`}>
            {showTotals ? result.power[me] : runningOf(me)}
          </span>
        </div>

        <BattleSide
          lines={result.lines[me]}
          revealed={revealedUids}
          activeUid={activeUid}
          name={meName}
          total={result.power[me]}
          raw={result.raw[me]}
          weakenedBy={result.weaken[them]}
          showTotal={showTotals}
          target={target}
          busted={scored.busted[me]}
        />

        <div className={`battle__result ${showDamage ? 'is-on' : ''}`}>
          <div className={`battle__verdict battle__verdict--${result.winner === me ? 'win' : result.winner === null ? 'tie' : 'loss'}`}>
            {t(verdict as 'battle.roundWin')}
          </div>

          {/* The arithmetic itself. The two totals were on screen but the game
              never said that their difference IS the damage — the one rule the
              whole match turns on. */}
          {/* A busted row is not arithmetic, it is a rule, and printing
              "0 − 7 = 7" would teach the wrong one. */}
          {scored.busted[me] || scored.busted[them] ? (
            <div className="battle__math">{t('battle.bust', { target: target ?? 0 })}</div>
          ) : (
            result.winner !== null && (
              <div className="battle__math">
                {t('battle.math', {
                  winner: scored.effective[result.winner],
                  loser: scored.effective[other(result.winner)],
                  damage: scored.damage,
                })}
              </div>
            )
          )}

          <div className="battle__hp">
            <HpBar
              label={themName}
              hp={showDamage ? result.hpAfter[them] : result.hpAfter[them] - result.hpDelta[them]}
              maxHp={maxHp[them]}
              delta={showDamage ? result.hpDelta[them] : null}
              compact
            />
            <HpBar
              label={meName}
              hp={showDamage ? result.hpAfter[me] : result.hpAfter[me] - result.hpDelta[me]}
              maxHp={maxHp[me]}
              delta={showDamage ? result.hpDelta[me] : null}
              compact
            />
          </div>

          {showDamage && <BattleFootnotes result={result} me={me} them={them} />}
        </div>

        <div className="battle__actions">
          {finished ? (
            <button type="button" className="btn btn--primary" onClick={onDone}>
              {t('common.continue')}
            </button>
          ) : (
            <div className="battle__hint tiny">{t('battle.tapToSkip')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

interface SideProps {
  lines: RoundResult['lines'][number];
  revealed: Set<string>;
  activeUid: string | undefined;
  name: string;
  total: number;
  raw: number;
  weakenedBy: number;
  showTotal: boolean;
  /** The `closest` target, or null under any rule that just sums. */
  target: number | null;
  busted: boolean;
}

function BattleSide({
  lines,
  revealed,
  activeUid,
  name,
  total,
  raw,
  weakenedBy,
  showTotal,
  target,
  busted,
}: SideProps) {
  const t = useT();
  const running = lines.reduce((sum, line) => (revealed.has(line.uid) ? sum + line.total : sum), 0);

  return (
    <div className="battle__side">
      <div className="battle__side-head">
        <span className="tiny">{name}</span>
        {/* The target rides with each side's own total. Printed once between
            the two it reads as a denominator of whichever number it touches. */}
        <span className={`battle__running ${showTotal && busted ? 'is-bust' : ''}`}>
          {showTotal ? total : running}
          {target !== null && <span className="battle__running-target">/{target}</span>}
        </span>
      </div>
      <div className="battle__cards">
        {lines.map((line) => {
          const shown = revealed.has(line.uid);
          return (
            <div className="battle__card" key={line.uid}>
              <CardView
                cardId={line.cardId}
                size="battle"
                livePower={shown ? line.total : undefined}
                dimmed={!shown}
                active={activeUid === line.uid}
              />
              {shown && line.bonus !== 0 && (
                <span className={`battle__bonus ${line.bonus > 0 ? 'is-up' : 'is-down'}`}>
                  {line.bonus > 0 ? `+${line.bonus}` : line.bonus}
                </span>
              )}
            </div>
          );
        })}
      </div>
      {showTotal && weakenedBy > 0 && (
        <div className="battle__note tiny">
          {raw} {t('battle.weaken', { amount: weakenedBy })}
        </div>
      )}
    </div>
  );
}

function BattleFootnotes({ result, me, them }: { result: RoundResult; me: PlayerIndex; them: PlayerIndex }) {
  const t = useT();
  const notes: string[] = [];
  const loser = result.winner === null ? null : other(result.winner);

  if (loser === me && result.shield[me] > 0) notes.push(t('battle.shielded', { amount: result.shield[me] }));
  if (result.burn[me] > 0) notes.push(t('battle.burn', { amount: result.burn[me] }));
  if (result.burn[them] > 0) notes.push(t('battle.burn', { amount: result.burn[them] }));
  if (result.heal[me] > 0) notes.push(t('battle.heal', { amount: result.heal[me] }));

  if (notes.length === 0) return null;
  return (
    <div className="battle__notes tiny">
      {notes.map((note) => (
        <span className="chip" key={note}>
          {note}
        </span>
      ))}
    </div>
  );
}
