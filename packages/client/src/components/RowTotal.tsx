import { getCard } from '@delezh/cards';
import { rowPower, type CardInstance } from '@delezh/engine';
import './rowtotal.css';

/**
 * The running power of one side's row, and what a candidate pick would make it.
 *
 * Until this existed neither total was on screen during the draft — the numbers
 * only appeared in the battle overlay, after the decision was made, so a player
 * could not see that taking Pack Leader turns their 4 into a 9.
 *
 * Under `closest` it carries the whole rule: the target is printed beside the
 * total, and a pick that would go over is shown going over rather than being
 * silently clamped to nothing. A player has to be able to see the cliff before
 * stepping off it, or the rule is a gotcha instead of a decision.
 *
 * Computed with the engine's own resolver, so the preview cannot drift from
 * what the battle will actually do.
 */
export function rowTotalOf(cards: CardInstance[], opponent: CardInstance[]): number {
  return rowPower(
    cards.map((c) => getCard(c.cardId)),
    opponent.map((c) => getCard(c.cardId)),
  );
}

/** The total this side would have after adding `candidate`. */
export function projectedTotal(
  cards: CardInstance[],
  opponent: CardInstance[],
  candidate: CardInstance,
): number {
  return rowTotalOf([...cards, candidate], opponent);
}

export interface RowTotalProps {
  total: number;
  /** When set and different, shown as `total → projected`. */
  projected?: number | null;
  label: string;
  align?: 'start' | 'end';
  /** The `closest` target, or null under any rule that just sums. */
  target?: number | null;
}

export function RowTotal({ total, projected = null, label, align = 'start', target = null }: RowTotalProps) {
  const changed = projected !== null && projected !== total;
  const bust = target !== null && total > target;
  const wouldBust = target !== null && changed && projected > target;

  return (
    <div className={`rowtotal rowtotal--${align}`}>
      <span className="rowtotal__label tiny">{label}</span>
      <span className={`rowtotal__value ${bust ? 'is-bust' : ''}`}>{total}</span>
      {target !== null && <span className="rowtotal__target tiny">/{target}</span>}
      {changed && (
        <>
          <span className="rowtotal__arrow" aria-hidden="true">
            →
          </span>
          <span
            className={`rowtotal__value rowtotal__value--${projected > total ? 'up' : 'down'} ${
              // A pick that busts is not an increase, whatever the arithmetic
              // says, so it must not be dressed in the same colour as one.
              wouldBust ? 'is-bust' : ''
            }`}
          >
            {projected}
          </span>
        </>
      )}
    </div>
  );
}
