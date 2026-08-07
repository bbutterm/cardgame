import { memo } from 'react';
import { getCard } from '@delezh/cards';
import { useI18n } from '../i18n/index.js';
import { CardArt } from '../art/procedural.js';
import './card.css';

export type CardSize = 'full' | 'battle' | 'mini' | 'tiny';

export interface CardViewProps {
  cardId: string;
  size?: CardSize;
  selected?: boolean;
  dimmed?: boolean;
  disabled?: boolean;
  /** Power actually contributed in battle, when it differs from the printed one. */
  livePower?: number;
  /** Highlight ring used while the battle animation walks the row. */
  active?: boolean;
  onClick?: () => void;
}

/**
 * One card face. The faction drives the frame colour, rarity drives the border
 * treatment, and the printed power is always the largest thing on the card —
 * at 360px a player scanning five cards reads numbers first and text second.
 */
export const CardView = memo(function CardView({
  cardId,
  size = 'full',
  selected = false,
  dimmed = false,
  disabled = false,
  livePower,
  active = false,
  onClick,
}: CardViewProps) {
  const { locale } = useI18n();
  const card = getCard(cardId);
  const boosted = livePower !== undefined && livePower > card.power;
  const weakened = livePower !== undefined && livePower < card.power;

  const className = [
    'card',
    `card--${size}`,
    `card--${card.faction}`,
    `card--${card.rarity}`,
    selected && 'is-selected',
    dimmed && 'is-dimmed',
    active && 'is-active',
  ]
    .filter(Boolean)
    .join(' ');

  const content = (
    <>
      <div className="card__art">
        <CardArt cardId={card.id} faction={card.faction} art={card.art} className="card__art-svg" />
        <span
          className={`card__power ${boosted ? 'is-boosted' : ''} ${weakened ? 'is-weakened' : ''}`}
          aria-label={`power ${livePower ?? card.power}`}
        >
          {livePower ?? card.power}
        </span>
      </div>
      {size !== 'tiny' && (
        <div className="card__body">
          <div className="card__name">{card.name[locale]}</div>
          {card.text[locale] && <div className="card__text">{card.text[locale]}</div>}
        </div>
      )}
    </>
  );

  if (!onClick) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button type="button" className={className} onClick={onClick} disabled={disabled} aria-pressed={selected}>
      {content}
    </button>
  );
});

/** Placeholder that keeps a taken slot's footprint so the row never reflows. */
export function CardSlotGhost({ size = 'full' }: { size?: CardSize }) {
  return <div className={`card card--${size} card--ghost`} aria-hidden="true" />;
}
