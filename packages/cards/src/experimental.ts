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
    effects: [{ kind: 'lonerBonus', amount: 6 }],
    experimental: true,
  },
  {
    id: 'last-stand',
    name: { ru: 'Последний рубеж', en: 'Last Stand' },
    text: { ru: '+4, если у тебя меньше HP', en: '+4 if you have less HP' },
    power: 2,
    faction: 'machine',
    rarity: 'rare',
    tags: ['construct'],
    weight: 5,
    maxCopies: 2,
    effects: [{ kind: 'powerIf', amount: 4, cond: { type: 'behind' } }],
    experimental: true,
  },
  {
    id: 'aegis-mote',
    name: { ru: 'Осколок эгиды', en: 'Aegis Mote' },
    text: { ru: 'Щит 4', en: 'Shield 4' },
    power: 1,
    faction: 'machine',
    rarity: 'common',
    tags: ['construct', 'relic'],
    weight: 6,
    maxCopies: 2,
    // Shield on a body that expects to LOSE its row. On Bulwark's 8-power body
    // the effect measured at roughly zero, because an 8 rarely loses.
    effects: [{ kind: 'shield', amount: 4 }],
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
    text: { ru: 'Оппонент теряет 3 силы', en: 'Opponent loses 3 power' },
    power: 1,
    faction: 'shadow',
    rarity: 'rare',
    tags: ['omen'],
    weight: 4,
    maxCopies: 2,
    // Twice Nightmare's weaken on a third of the body. Weaken is the one effect
    // that can flip a row without adding anything to your own side.
    effects: [{ kind: 'weaken', amount: 3 }],
    experimental: true,
  },
  {
    id: 'salvager',
    name: { ru: 'Мусорщик', en: 'Salvager' },
    text: { ru: 'Сила равна сильнейшей твоей карте', en: 'Power equals your strongest other card' },
    power: 0,
    faction: 'machine',
    rarity: 'common',
    tags: ['construct'],
    weight: 6,
    maxCopies: 2,
    // A second Mirror Idol in a faction that has synergy support, to see whether
    // the effect's balance came from the card or from being colourless.
    effects: [{ kind: 'mirrorStrongest' }],
    experimental: true,
  },
];
