import { CARDS } from './cards.js';
import { EXPERIMENTAL_CARDS } from './experimental.js';
import type { CardDef, LocalizedText } from './types.js';

/**
 * A short single-player campaign.
 *
 * This is data, not code. Every lever an encounter pulls already exists:
 * `createMatch` takes its own card pool and `MatchConfig`, and the bot has three
 * levels. Nothing here required an engine change except the optional starting-HP
 * override, which is what makes a handicap expressible.
 *
 * The design rule for the set: each encounter teaches exactly one thing, by
 * making it the only thing on the table. A pool of nothing but Machines is a
 * more honest lesson about counting synergies than any tutorial text.
 */

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Encounter {
  id: string;
  /** The opponent's name — this is who you are playing, not a level number. */
  name: LocalizedText;
  /** One line on what this fight is about. Same eight-word discipline as cards. */
  blurb: LocalizedText;
  /** The rules twist, when there is one. Empty string means "normal rules". */
  twist: LocalizedText;
  difficulty: Difficulty;
  /** Card ids this encounter deals from. At least five distinct. */
  pool: string[];
  /** Match config overrides. */
  rounds?: number;
  /** Starting HP as [player, opponent] — the only way to express a handicap. */
  hp?: [number, number];
}

const VANILLA = ['ember', 'cog', 'shade', 'wolf-pup', 'flame-hound', 'iron-drone', 'wanderer', 'stone-boar'];

export const CAMPAIGN: readonly Encounter[] = [
  {
    id: 'cub',
    name: { ru: 'Волчонок', en: 'The Cub' },
    blurb: { ru: 'Только цифры. Больше — лучше.', en: 'Numbers only. Bigger is better.' },
    twist: { ru: '', en: '' },
    difficulty: 'easy',
    // Nothing but vanilla: the first fight has no text to read at all.
    pool: VANILLA,
  },
  {
    id: 'pack',
    name: { ru: 'Вожак стаи', en: 'Pack Leader' },
    blurb: { ru: 'Звери сильнее вместе.', en: 'Beasts are stronger together.' },
    twist: { ru: '', en: '' },
    difficulty: 'easy',
    pool: ['wolf-pup', 'stone-boar', 'pack-leader', 'swarm-rat', 'beast-tamer', 'wanderer', 'cog', 'shade'],
  },
  {
    id: 'forge',
    name: { ru: 'Мастер-сборщик', en: 'The Assembler' },
    blurb: { ru: 'Считай механизмы, не силу.', en: 'Count the Machines, not the power.' },
    twist: { ru: '', en: '' },
    difficulty: 'normal',
    pool: ['cog', 'iron-drone', 'siege-core', 'assembler', 'spark-relay', 'bulwark', 'wanderer', 'ember'],
  },
  {
    id: 'pyre',
    name: { ru: 'Пиромант', en: 'The Pyromancer' },
    blurb: { ru: 'Огонь разгорается с каждой картой.', en: 'Fire grows with every card.' },
    twist: { ru: '', en: '' },
    difficulty: 'normal',
    pool: ['ember', 'flame-hound', 'pyre-giant', 'wildfire', 'spark-relay', 'cinder-priest', 'cog', 'wanderer'],
  },
  {
    id: 'thief',
    name: { ru: 'Тихий вор', en: 'The Quiet Thief' },
    blurb: { ru: 'Отбирай. Ему нужнее.', en: 'Take what they need.' },
    twist: { ru: '', en: '' },
    difficulty: 'normal',
    // Shadow's weaken and peek: the fight where denying beats building.
    pool: ['shade', 'night-blade', 'shadow-broker', 'nightmare', 'seer', 'void-titan', 'wanderer', 'cog'],
  },
  {
    id: 'sprint',
    name: { ru: 'Гонец', en: 'The Courier' },
    blurb: { ru: 'Три ряда. Ошибаться некогда.', en: 'Three rows. No room to misplay.' },
    twist: { ru: '3 ряда, 7 HP', en: '3 rows, 7 HP' },
    difficulty: 'normal',
    pool: [...VANILLA, 'wildfire', 'pack-leader', 'assembler', 'shadow-broker', 'herald', 'quickstep'],
    rounds: 3,
    hp: [7, 7],
  },
  {
    id: 'heavy',
    name: { ru: 'Тяжеловес', en: 'The Heavyweight' },
    blurb: { ru: 'Большие цифры стоят хода.', en: 'Big numbers cost you a turn.' },
    twist: { ru: '', en: '' },
    difficulty: 'hard',
    // Every tempo card in the game, so the cost has to be priced every row.
    pool: ['warlord', 'void-titan', 'apex-beast', 'bulwark', 'colossus', 'siege-core', 'pyre-giant', 'wanderer', 'cog', 'ember'],
  },
  {
    id: 'archivist',
    name: { ru: 'Архивариус', en: 'The Archivist' },
    blurb: { ru: 'Он знает все карты. Ты тоже.', en: 'They know every card. So do you.' },
    twist: { ru: 'Ты начинаешь с 9 HP', en: 'You start on 9 HP' },
    difficulty: 'hard',
    // The whole set, experiments included, and a handicap. The graduation fight.
    pool: [...CARDS, ...EXPERIMENTAL_CARDS].map((c) => c.id),
    hp: [9, 12],
  },
];

const BY_ID = new Map(CAMPAIGN.map((e) => [e.id, e]));

export function getEncounter(id: string): Encounter | undefined {
  return BY_ID.get(id);
}

/** Resolves an encounter's pool to card definitions. Throws on an unknown id. */
export function encounterPool(encounter: Encounter, all: readonly CardDef[]): CardDef[] {
  return encounter.pool.map((id) => {
    const card = all.find((c) => c.id === id);
    if (!card) throw new Error(`encounter ${encounter.id} references unknown card ${id}`);
    return card;
  });
}
