import { getCard } from '@delezh/cards';
import { rowPower, type CardInstance } from '@delezh/engine';
import './rowtotal.css';

/**
 * The running power of one side's row, and what a candidate pick would make it.
 *
 * The whole game is "sum of my row vs sum of theirs, the difference is damage",
 * and until this existed neither sum was on screen during the draft — the
 * numbers only appeared in the battle overlay, after the decision was made. A
 * player could not see that taking Pack Leader turns their 4 into a 9.
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
}

export function RowTotal({ total, projected = null, label, align = 'start' }: RowTotalProps) {
  const changed = projected !== null && projected !== total;
  return (
    <div className={`rowtotal rowtotal--${align}`}>
      <span className="rowtotal__label tiny">{label}</span>
      <span className="rowtotal__value">{total}</span>
      {changed && (
        <>
          <span className="rowtotal__arrow" aria-hidden="true">
            →
          </span>
          <span className={`rowtotal__value rowtotal__value--${projected > total ? 'up' : 'down'}`}>
            {projected}
          </span>
        </>
      )}
    </div>
  );
}
