import type { CardDef } from './types.js';

/**
 * Cards that survived the experimental balance pass.
 *
 * Everything here was proposed, simulated and kept only if it landed inside the
 * 42–58% corridor on the metric that measures it. Rejected designs and the
 * reasoning behind each verdict live in EXPERIMENTS.md.
 *
 * These are additive: the base 30 keep their composition counts, and the tests
 * that assert those counts filter on `experimental`.
 */
export const EXPERIMENTAL_CARDS: readonly CardDef[] = [
  {
    id: 'lone-wolf',
    name: { ru: 'Одинокий волк', en: 'Lone Wolf' },
    text: { ru: 'Сильнее, когда карт мало', en: 'Stronger when you took fewer' },
    power: 1,
    faction: 'beast',
    rarity: 'rare',
    tags: ['hunter'],
    weight: 5,
    maxCopies: 2,
    // The only card that rewards the two-card seat without keying on the seat
    // itself, which is what made the original "+N if you picked second" card
    // unplayable (see PROGRESS.md D-07).
    //
    // 7 was too strong under `sum` and 6 was right; under `closest` 6 was too
    // strong again for a different reason — a 5-power body pairs with almost
    // anything to land on 11 from the two-card seat, and the card alone cost
    // the first picker 4.5 points of seat fairness.
    effects: [{ kind: 'lonerBonus', amount: 5 }],
    experimental: true,
  },
  {
    id: 'last-stand',
    name: { ru: 'Последний рубеж', en: 'Last Stand' },
    text: { ru: '+2, если у тебя меньше HP', en: '+2 if you have less HP' },
    power: 2,
    faction: 'machine',
    rarity: 'rare',
    tags: ['construct'],
    weight: 5,
    maxCopies: 2,
    // The first picker starts 2 HP down, so `behind` fires for them far more
    // often — and at +4 the card it fired on was a 6, which is most of a row's
    // budget under `closest`. It read 36.5% and cost the first picker 3.2
    // points of seat fairness. At +2 the body stays playable in a three-card
    // row and both numbers came back.
    effects: [{ kind: 'powerIf', amount: 2, cond: { type: 'behind' } }],
    experimental: true,
  },
  {
    id: 'aegis-mote',
    name: { ru: 'Осколок эгиды', en: 'Aegis Mote' },
    text: { ru: 'Щит 2', en: 'Shield 2' },
    power: 1,
    faction: 'machine',
    rarity: 'common',
    tags: ['construct', 'relic'],
    weight: 6,
    maxCopies: 2,
    // Shield on a body that expects to LOSE its row. On Bulwark's 8-power body
    // the effect measured at roughly zero, because an 8 rarely loses.
    //
    // 4 was tuned against uncapped damage. `maxRoundDamage: 5` turned it into
    // a near-total refund of a lost row, and under `closest` the two-card seat
    // is the one that loses rows, so the card alone cost the first picker 3.4
    // points of seat fairness at 4 and 2.6 at 3.
    //
    // Dropping to 2 *raised* the card's own win rate, 48.5% → 50.1%. Shield
    // cannot cost its holder HP, so the only channel is the pick: a bigger
    // shield buys the card priority it is not worth. Bulwark shows the same
    // sign far more strongly — see the note there.
    effects: [{ kind: 'shield', amount: 2 }],
    experimental: true,
  },
  {
    id: 'ash-herald',
    name: { ru: 'Вестник пепла', en: 'Ash Herald' },
    text: { ru: '2 урона. Смотри следующий ряд', en: 'Deal 2. Peek at next row' },
    power: 1,
    faction: 'fire',
    rarity: 'rare',
    tags: ['spark', 'omen'],
    weight: 4,
    maxCopies: 2,
    effects: [{ kind: 'burn', amount: 2 }, { kind: 'revealNextRow' }],
    experimental: true,
  },
  {
    id: 'ember-cascade',
    name: { ru: 'Каскад искр', en: 'Ember Cascade' },
    text: { ru: '+3 за каждую другую Искру', en: '+3 per other Spark card' },
    power: 1,
    faction: 'fire',
    rarity: 'common',
    tags: ['spark'],
    weight: 6,
    maxCopies: 2,
    // Tests the tag axis rather than the faction axis: Spark spans Fire and
    // Machine, so this rewards a cluster the colour of the board does not show.
    effects: [{ kind: 'powerPer', amount: 3, counter: { scope: 'self', tag: 'spark', excludeSelf: true } }],
    experimental: true,
  },
  {
    id: 'night-terror',
    name: { ru: 'Ночной ужас', en: 'Night Terror' },
    text: { ru: 'Оппонент теряет 2 силы', en: 'Opponent loses 2 power' },
    power: 1,
    faction: 'shadow',
    rarity: 'rare',
    tags: ['omen'],
    weight: 4,
    maxCopies: 2,
    // Twice Nightmare's weaken on half the body. Weaken is the one effect that
    // can flip a row without adding anything to your own side, and under
    // `closest` it got strictly better: it cannot rescue a busted opponent, so
    // every point of it is pure subtraction. Both weaken cards stepped down one
    // — at 3 this read 61.1%.
    //
    // Paying for weaken 3 with a bigger body instead was tried and rejected:
    // power 5 reads 53.3% but power 6 reads 36.3%, so the design would be
    // balanced on a one-point cliff.
    effects: [{ kind: 'weaken', amount: 2 }],
    experimental: true,
  },
];
