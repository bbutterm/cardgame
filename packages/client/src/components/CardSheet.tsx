import { getCard } from '@delezh/cards';
import { useI18n } from '../i18n/index.js';
import { CardView } from './Card.js';
import './cardsheet.css';

/**
 * A card at readable size, with its faction and tags named.
 *
 * Card faces clamp their rules text, and the cards whose text you most need to
 * read — the synergy ones — are exactly the ones that overflow. This is the way
 * to read one in full. Faction is also spelled out here: the board leans on
 * faction colour as its main signal, but nothing on it ever said that the green
 * cards are Beasts, which makes "+3 per other Swarm card" unlearnable.
 */
export function CardSheet({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const { t, locale } = useI18n();
  const card = getCard(cardId);

  return (
    <div className="cardsheet" onClick={onClose} role="dialog" aria-modal="true">
      <div className="brut cardsheet__inner" onClick={(event) => event.stopPropagation()}>
        <div className="cardsheet__card">
          <CardView cardId={cardId} size="full" />
        </div>
        <div className="cardsheet__body">
          <div className="cardsheet__name">{card.name[locale]}</div>
          <div className="cardsheet__tags">
            <span className={`chip chip--${card.faction}`}>{t(`faction.${card.faction}` as 'faction.beast')}</span>
            {card.tags.map((tag) => (
              <span className="chip" key={tag}>
                {tag}
              </span>
            ))}
          </div>
          {card.text[locale] && <p className="cardsheet__text">{card.text[locale]}</p>}
        </div>
        <button type="button" className="btn" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  );
}
