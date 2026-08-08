import { useCallback, useEffect, useMemo, useState } from 'react';
import { getCard } from '@delezh/cards';
import { DEFAULT_CONFIG, resolveLines } from '@delezh/engine';
import { useT } from '../i18n/index.js';
import { CardSlotGhost, CardView } from '../components/Card.js';
import { HpBar } from '../components/HpBar.js';
import { haptic, playSound } from '../audio.js';
import './tutorial.css';

/**
 * Three steps, under thirty seconds.
 *
 * Step 1 is a real draft rather than a diagram: five cards, the player takes
 * one and the opponent immediately takes another in front of them. Denial is
 * the whole game and it cannot be asserted in a sentence — it has to be done to
 * you once. The 3/2 split then falls out of the interaction instead of being
 * claimed, and the pick clock is the same draining bar the match screen uses.
 *
 * Step 2 fights the row the player actually drafted, through the engine's own
 * `resolveLines`, so the totals and the HP loss are the real ones. Every card
 * in the demo row is vanilla (no rules text), so "power adds up" is literally
 * the printed numbers added up — the first thing a new player needs to be able
 * to do unaided.
 *
 * Step 3 is the only expository beat, and it carries the three numbers a player
 * would otherwise meet unexplained on the match screen: 5 rows, 11/13 HP, 20s.
 */

/**
 * Powers 3, 4, 1, 2, 1. Two properties are load-bearing:
 *
 *  - the sum is **odd**, so no split of it can tie. The demo battle always has
 *    a loser and therefore always has damage to show, whatever the player picks;
 *  - all five are **vanilla** (no rules text), so "power adds up" is literally
 *    the printed numbers added up — the first thing a new player must be able
 *    to do unaided.
 *
 * Every name is also eight characters or fewer in both locales. Card names wrap
 * with `overflow-wrap: anywhere`, and a longer one breaks mid-word on the
 * narrower cards this screen uses, which reads as a typo rather than as small
 * text.
 */
/**
 * Five vanilla cards, chosen so the row can actually be overshot.
 *
 * The old row (3/4/1/2/1) summed to 11, so the best a three-card side could
 * reach was 9 — under a target of 11 the lesson the tutorial exists to teach
 * could not happen in it. Three 4s and two 1s means taking every big number
 * lands on 12 and scores nothing, which is the whole rule in one move a player
 * makes themselves rather than reads about.
 */
const ROW = ['pyre-giant', 'colossus', 'siege-core', 'cog', 'ember'];
const TOTAL = 3;
const START_HP = 11;
const PICK_MS = 20_000;
const TICK_MS = 100;
/** Long enough to be seen as a reply, short enough not to be a wait. */
const BOT_DELAY_MS = 620;
const FLASH_MS = 1700;
const CLASH_MS = 350;
const DAMAGE_MS = 950;

type Turn = 'me' | 'them' | 'over';
type Flash = 'denied' | 'timeUp' | null;

/** The same rule the engine uses to auto-pick, and what an easy bot does. */
function strongestIndex(open: (string | null)[]): number {
  let best = -1;
  let bestPower = -1;
  open.forEach((id, index) => {
    if (!id) return;
    const power = getCard(id).power;
    if (power > bestPower) {
      best = index;
      bestPower = power;
    }
  });
  return best;
}

export function TutorialScreen({ onDone }: { onDone: () => void }) {
  const t = useT();
  const [step, setStep] = useState(0);

  const [open, setOpen] = useState<(string | null)[]>(() => [...ROW]);
  const [mine, setMine] = useState<string[]>([]);
  const [theirs, setTheirs] = useState<string[]>([]);
  const [turn, setTurn] = useState<Turn>('me');
  const [msLeft, setMsLeft] = useState(PICK_MS);
  const [flash, setFlash] = useState<Flash>(null);
  const [phase, setPhase] = useState(0);

  const take = useCallback(
    (index: number, by: 'me' | 'them') => {
      const card = open[index];
      if (!card) return;
      const nextOpen = open.slice();
      nextOpen[index] = null;
      const left = nextOpen.filter(Boolean).length;
      setOpen(nextOpen);
      if (by === 'me') setMine([...mine, card]);
      else setTheirs([...theirs, card]);
      setTurn(left === 0 ? 'over' : by === 'me' ? 'them' : 'me');
    },
    [open, mine, theirs],
  );

  // The opponent answers every pick, in view, with the biggest card left.
  useEffect(() => {
    if (step !== 0 || turn !== 'them') return;
    const timer = window.setTimeout(() => {
      const index = strongestIndex(open);
      if (index < 0) return;
      playSound('reveal');
      haptic(10);
      // Normally the very first reply, but if the pick clock ran out that
      // callout owns the slot, so denial waits for the opponent's second pick
      // rather than being clobbered after 600ms.
      if (theirs.length < 2) setFlash((current) => current ?? 'denied');
      take(index, 'them');
    }, BOT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [step, turn, open, theirs.length, take]);

  // The real 20s clock, ticking at the same 100ms the match screen ticks at.
  // Letting it run out is not a dead end: the engine auto-picks on timeout, so
  // the tutorial does too, and says so.
  useEffect(() => {
    if (step !== 0 || turn !== 'me') return;
    const startedAt = Date.now();
    setMsLeft(PICK_MS);
    const id = window.setInterval(() => {
      const left = PICK_MS - (Date.now() - startedAt);
      if (left > 0) {
        setMsLeft(left);
        return;
      }
      window.clearInterval(id);
      setMsLeft(0);
      const index = strongestIndex(open);
      if (index < 0) return;
      setFlash('timeUp');
      playSound('pick');
      haptic([30, 40, 30]);
      take(index, 'me');
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [step, turn, open, take]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [flash]);

  // The battle is the engine's, not a mock-up: whatever the player drafted is
  // what gets summed here.
  const fight = useMemo(() => {
    const myCards = mine.map(getCard);
    const theirCards = theirs.map(getCard);
    const myLines = resolveLines(myCards, theirCards, false);
    const theirLines = resolveLines(theirCards, myCards, true);
    const mySum = myLines.reduce((sum, line) => sum + line.total, 0);
    const theirSum = theirLines.reduce((sum, line) => sum + line.total, 0);

    // Scored the way the engine scores it, rather than by subtracting sums:
    // a tutorial that quietly teaches the wrong rule is worse than none.
    const target = DEFAULT_CONFIG.rowTarget;
    const myBust = mySum > target;
    const theirBust = theirSum > target;
    const diff = (myBust ? 0 : mySum) - (theirBust ? 0 : theirSum);

    return { myLines, theirLines, mySum, theirSum, myBust, theirBust, target, diff };
  }, [mine, theirs]);

  useEffect(() => {
    if (step !== 1) return;
    setPhase(0);
    const clash = window.setTimeout(() => {
      setPhase(1);
      playSound('clash');
      haptic(14);
    }, CLASH_MS);
    const damage = window.setTimeout(() => {
      setPhase(2);
      playSound(fight.diff > 0 ? 'win' : 'hurt');
      haptic(fight.diff > 0 ? [16, 40, 16] : [40]);
    }, DAMAGE_MS);
    return () => {
      window.clearTimeout(clash);
      window.clearTimeout(damage);
    };
  }, [step, fight.diff]);

  const next = () => {
    playSound('tap');
    haptic(8);
    if (step + 1 >= TOTAL) onDone();
    else setStep(step + 1);
  };

  // Capped exactly as a real row is, so the number on screen is the number the
  // game would deal.
  const damage = Math.min(Math.abs(fight.diff), DEFAULT_CONFIG.maxRoundDamage || Infinity);
  const myHp = START_HP - (fight.diff < 0 ? damage : 0);
  const theirHp = START_HP - (fight.diff > 0 ? damage : 0);
  const seconds = Math.ceil(msLeft / 1000);
  // Once the row is gone the two piles are the whole picture, so they stop
  // being thumbnails and grow into named cards.
  const pileSize = turn === 'over' ? 'battle' : 'mini';
  const timerRatio = turn === 'me' ? msLeft / PICK_MS : 0;

  const title = [t('tutorial.s1.title'), t('tutorial.s2.title'), t('tutorial.s3.title')][step];
  const body =
    step === 0
      ? turn === 'over'
        ? t('tutorial.s1.split')
        : t('tutorial.s1.body')
      : step === 1
        ? phase < 2
          ? t('tutorial.s2.body')
          : fight.myBust
            ? t('tutorial.s2.bust')
            : t(fight.diff > 0 ? 'tutorial.s2.win' : 'tutorial.s2.loss', { n: damage })
        : t('tutorial.s3.body');

  return (
    <div className="screen tutorial" aria-label={t('tutorial.title')}>
      <div className="tutorial__head">
        <span className="tiny">{t('tutorial.step', { n: step + 1, total: TOTAL })}</span>
        <button type="button" className="btn btn--ghost btn--sm btn--auto tutorial__skip" onClick={onDone}>
          {t('common.skip')}
        </button>
      </div>

      <div className="tutorial__dots">
        {Array.from({ length: TOTAL }, (_, i) => (
          <span key={i} className={`tutorial__dot ${i <= step ? 'is-on' : ''}`} />
        ))}
      </div>

      <div className="tutorial__body">
        <h2 className="tutorial__title">{title}</h2>
        <p className="tutorial__text">{body}</p>
      </div>

      <div className="tutorial__stage">
        {step === 0 && (
          <div className={`tutorial__board ${turn === 'over' ? 'is-split' : ''}`}>
            {turn !== 'over' && (
              <div className="tutorial__clock">
                <span className="tiny tutorial__clock-label">
                  {turn === 'me' ? `${t('tutorial.yourTurn')} · ${seconds}` : t('tutorial.theirTurn')}
                </span>
                <div className="tutorial__timer">
                  <div
                    className={`tutorial__timer-fill ${timerRatio < 0.3 ? 'is-urgent' : ''}`}
                    style={{ width: `${timerRatio * 100}%` }}
                  />
                </div>
              </div>
            )}

            <div className="tutorial__strip">
              <span className="tiny tutorial__strip-label">
                {t('tutorial.theirs')}
                {turn === 'over' && ` · ${theirs.length}`}
              </span>
              <div className="tutorial__strip-cards">
                {theirs.map((id, i) => (
                  <CardView key={`${id}-${i}`} cardId={id} size={pileSize} />
                ))}
              </div>
            </div>

            {/* Two lines, 3 + 2, exactly as the match board lays the row out. */}
            <div className="tutorial__row">
              {[open.slice(0, 3), open.slice(3)].map((group, groupIndex) => (
                <div className={`tutorial__line tutorial__line--${group.length}`} key={groupIndex}>
                  {group.map((id, index) =>
                    id ? (
                      <CardView
                        key={id}
                        cardId={id}
                        size="full"
                        onClick={
                          turn === 'me'
                            ? () => {
                                playSound('pick');
                                haptic([14, 30, 10]);
                                take(groupIndex * 3 + index, 'me');
                              }
                            : undefined
                        }
                      />
                    ) : (
                      <CardSlotGhost key={`gap-${groupIndex}-${index}`} />
                    ),
                  )}
                </div>
              ))}
            </div>

            <div className="tutorial__strip tutorial__strip--me">
              <span className="tiny tutorial__strip-label">
                {t('tutorial.mine')}
                {turn === 'over' && ` · ${mine.length}`}
              </span>
              <div className="tutorial__strip-cards">
                {mine.map((id, i) => (
                  <CardView key={`${id}-${i}`} cardId={id} size={pileSize} />
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="tutorial__fight">
            <FightSide
              name={t('tutorial.theirs')}
              cards={theirs}
              lines={fight.theirLines}
              sum={fight.theirSum}
              shown={phase >= 1}
              lost={fight.diff > 0}
            />
            <span className="tutorial__vs">×</span>
            <FightSide
              name={t('tutorial.mine')}
              cards={mine}
              lines={fight.myLines}
              sum={fight.mySum}
              shown={phase >= 1}
              lost={fight.diff < 0}
            />
            <div className="tutorial__hp">
              <HpBar
                label={t('tutorial.theirs')}
                hp={phase >= 2 ? theirHp : START_HP}
                maxHp={START_HP}
                delta={phase >= 2 && fight.diff > 0 ? -damage : null}
                compact
              />
              <HpBar
                label={t('tutorial.mine')}
                hp={phase >= 2 ? myHp : START_HP}
                maxHp={START_HP}
                delta={phase >= 2 && fight.diff < 0 ? -damage : null}
                compact
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="brut tutorial__facts">
            {/* The target leads, because it is the one number the whole game
                turns on and the only one a returning player might misremember. */}
            <div className="tutorial__fact">
              <div className="tutorial__target">{DEFAULT_CONFIG.rowTarget}</div>
              <span className="tiny tutorial__fact-text">{t('tutorial.s2.target')}</span>
            </div>
            <div className="tutorial__fact">
              <div className="tutorial__pips">
                {Array.from({ length: 5 }, (_, i) => (
                  <span key={i} className={`tutorial__pip ${i === 0 ? 'is-done' : ''}`} />
                ))}
              </div>
              <span className="tiny tutorial__fact-text">{t('tutorial.s3.rows')}</span>
            </div>
            <div className="tutorial__fact">
              <HpBar label={t('tutorial.mine')} hp={myHp} maxHp={START_HP} compact />
              <span className="tiny tutorial__fact-text">{t('tutorial.s3.hp')}</span>
            </div>
            <div className="tutorial__fact">
              <div className="tutorial__timer">
                <div className="tutorial__timer-fill" style={{ width: '38%' }} />
              </div>
              <span className="tiny tutorial__fact-text">{t('tutorial.s3.timer')}</span>
            </div>
          </div>
        )}
      </div>

      <div className="tutorial__foot">
        {step === 0 && turn !== 'over' ? (
          // The status line doubles as the callout slot: a chip here cannot
          // collide with the board, and it is where the eye already is.
          flash ? (
            <div className="chip tutorial__flash">{t(`tutorial.${flash}`)}</div>
          ) : (
            <div className="tutorial__prompt">{t('tutorial.tryIt')}</div>
          )
        ) : step === 1 && phase < 2 ? null : (
          <button type="button" className="btn btn--primary" onClick={next}>
            {step + 1 >= TOTAL ? t('tutorial.done') : t('common.continue')}
          </button>
        )}
      </div>
    </div>
  );
}

function FightSide({
  name,
  cards,
  lines,
  sum,
  shown,
  lost,
}: {
  name: string;
  cards: string[];
  lines: { total: number }[];
  sum: number;
  shown: boolean;
  lost: boolean;
}) {
  return (
    <div className="tutorial__side">
      <span className="tiny tutorial__side-name">{name}</span>
      <div className="tutorial__side-row">
        <div className="tutorial__side-cards">
          {cards.map((id, i) => (
            <CardView key={`${id}-${i}`} cardId={id} size="battle" livePower={lines[i]?.total} />
          ))}
        </div>
        <span className={`tutorial__sum ${shown && lost ? 'tutorial__sum--lose' : ''} ${shown ? 'is-shown' : ''}`}>
          {shown ? sum : '?'}
        </span>
      </div>
    </div>
  );
}
