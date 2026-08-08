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
 *
 * The ramp is carried by the pool, not by the bot level and not by HP. Measured
 * with `packages/bot/scripts/campaign.ts` (2000+ mirrored matches per encounter,
 * the human seat driven by a `hard` bot and again by a `normal` one), skill in
 * this game lives almost entirely in cards whose value differs from their
 * printed number:
 *
 *   - a pool of nothing but vanilla is a coin flip at *every* bot level, to the
 *     decimal — both sides take the biggest number, which is exactly optimal, so
 *     the deal decides the match and the player never does;
 *   - one synergy card in eight turns a 60% matchup into an 83% one;
 *   - two of them turn it into 95%.
 *
 * So pool size and synergy count are the vernier: a card is diluted by adding
 * plain bodies around it, and that moves a matchup smoothly where the three bot
 * levels only jump (easy -> normal costs a good player ~15 points, normal ->
 * hard another ~25). Pools stay between 8 and 12 cards; beyond that an encounter
 * stops having a face, and `buildRows` deals five of them per row regardless.
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
    twist: { ru: 'У Волчонка 8 HP', en: 'The Cub has 8 HP' },
    difficulty: 'easy',
    // Nothing but vanilla: the first fight has no text to read at all.
    //
    // This is the one encounter whose win rate cannot be tuned by its pool, and
    // the reason is the lesson itself. In a pure-vanilla row, row power is a
    // plain sum, so taking the biggest number is exactly optimal for both sides
    // and the deal decides the match: `easy`, `normal` and `hard` opponents all
    // produce 50.0% against a good player, to the decimal. What is left is the
    // easy bot's pick noise, worth 62% and no more — measured at 60% with seven
    // vanilla cards, 60% with twelve, 62% with these eight.
    //
    // 62% is too swingy for a first fight: better than a third of players would
    // lose the first game they ever play. So the Cub gets the handicap instead,
    // which is the one lever the pool cannot supply, and says so on the card.
    pool: VANILLA,
    hp: [11, 8],
  },
  {
    id: 'pack',
    name: { ru: 'Вожак стаи', en: 'Pack Leader' },
    blurb: { ru: 'Звери сильнее вместе.', en: 'Beasts are stronger together.' },
    twist: { ru: '', en: '' },
    difficulty: 'easy',
    // One axis only: Beast *faction*. Swarm Rat used to sit here and it counts a
    // tag that spans four factions, so the row taught two different countings at
    // once. Two four-power vanillas so the opening pick is not always the same
    // card — with a single 4 in the pool, Stone Boar opened 87% of its rows.
    pool: ['wolf-pup', 'stone-boar', 'pack-leader', 'beast-tamer', 'wanderer', 'cog', 'shade', 'flame-hound', 'night-blade'],
  },
  {
    id: 'forge',
    name: { ru: 'Мастер-сборщик', en: 'The Assembler' },
    blurb: { ru: 'Считай механизмы, не силу.', en: 'Count the Machines, not the power.' },
    twist: { ru: '', en: '' },
    difficulty: 'easy',
    // Bulwark is gone: an 8-power body opened 86% of the rows it appeared in, so
    // the encounter's only real decision was "take the 8" and the counting never
    // happened. Spark Relay is gone because it counts Fire, not Machines. What
    // is left is four Machines and the card that counts them.
    pool: ['cog', 'iron-drone', 'siege-core', 'assembler', 'wanderer', 'ember', 'shade', 'wolf-pup', 'colossus', 'flame-hound'],
  },
  {
    id: 'pyre',
    name: { ru: 'Пиромант', en: 'The Pyromancer' },
    blurb: { ru: 'Огонь разгорается с каждой картой.', en: 'Fire grows with every card.' },
    twist: { ru: '', en: '' },
    difficulty: 'normal',
    // Spark Relay's +4 is a threshold, not a scale; it reads as the same lesson
    // and is not. Wildfire is the only card here that pays per Fire card, and
    // five of the nine are Fire, so it pays.
    pool: ['ember', 'flame-hound', 'pyre-giant', 'wildfire', 'cinder-priest', 'cog', 'wanderer', 'shade', 'siege-core'],
  },
  {
    id: 'thief',
    name: { ru: 'Тихий вор', en: 'The Quiet Thief' },
    blurb: { ru: 'Отбирай. Ему нужнее.', en: 'Take what they need.' },
    twist: { ru: '', en: '' },
    difficulty: 'normal',
    // Shadow's weaken and peek: the fight where denying beats building. Void
    // Titan left — a tempo bomb is the *next* encounter's lesson, and it was
    // being taken ahead of the denial cards. Diluted to twelve so Shadow Broker
    // is a threat to answer rather than a coin flip on who sees it first.
    pool: [
      'shade', 'night-blade', 'shadow-broker', 'nightmare', 'seer',
      'wanderer', 'cog', 'stone-boar', 'flame-hound', 'iron-drone', 'ember', 'wolf-pup',
    ],
  },
  {
    id: 'sprint',
    name: { ru: 'Гонец', en: 'The Courier' },
    blurb: { ru: 'Три ряда. Ошибаться некогда.', en: 'Three rows. No room to misplay.' },
    twist: { ru: '3 ряда, 7 HP', en: '3 rows, 7 HP' },
    difficulty: 'normal',
    // Twelve, not fourteen: a three-row match deals fifteen cards, so a larger
    // pool than this stops having a face. Iron Drone dropped for Colossus so the
    // three rows are not all opened by the same Stone Boar.
    pool: [
      'ember', 'cog', 'shade', 'wolf-pup', 'flame-hound', 'wanderer', 'stone-boar', 'colossus',
      'wildfire', 'pack-leader', 'assembler', 'quickstep',
    ],
    rounds: 3,
    hp: [7, 7],
  },
  {
    id: 'heavy',
    name: { ru: 'Тяжеловес', en: 'The Heavyweight' },
    blurb: { ru: 'Большие цифры стоят хода.', en: 'Big numbers cost you a turn.' },
    twist: { ru: '', en: '' },
    difficulty: 'normal',
    // The three pure tempo bombs. Bulwark is the fourth and it cannot be here:
    // 8 power *and* a shield made it the opening pick of 93-96% of its rows, so
    // there was no tempo decision left to price. The cheap 1-power cards are
    // load-bearing — take them out and the rows flatten into 3s and 4s where
    // nobody can be baited, and a good player's win rate falls from 58% to 44%.
    pool: [
      'warlord', 'void-titan', 'apex-beast',
      'colossus', 'siege-core', 'pyre-giant', 'night-blade', 'stone-boar', 'wanderer', 'cog', 'ember', 'iron-drone',
    ],
  },
  {
    id: 'archivist',
    name: { ru: 'Архивариус', en: 'The Archivist' },
    blurb: { ru: 'Он знает все карты. Ты тоже.', en: 'They know every card. So do you.' },
    twist: { ru: 'Ты начинаешь с 9 HP', en: 'You start on 9 HP' },
    difficulty: 'hard',
    // One card per lesson the campaign taught, each with the partner that lets
    // it fire: numbers, counting (Assembler + Siege Core), per-card scaling
    // (Wildfire + Flame Hound), faction synergy (Pack Leader + Wolf Pup),
    // denial, information, pick order, tempo. The partners are the whole trick —
    // a first draft of this pool held the same synergy cards with nothing to
    // count, so Pack Leader was a vanilla 2 that read like a combo piece.
    //
    // The whole 37-card set was worse in both directions: 19 distinct cards a
    // match is a lottery rather than a graduation, and against a hard bot it put
    // an average player on 15%. Bulwark and Quickstep are the two deliberate
    // omissions — Bulwark opened 82% of the rows it appeared in even here, and
    // Quickstep is the one card an average player cannot use, dropping that
    // model from 40% to 27% while leaving a good player untouched.
    pool: [
      'wanderer', 'colossus', 'flame-hound', 'wolf-pup',
      'siege-core', 'assembler', 'wildfire', 'pack-leader',
      'nightmare', 'seer', 'herald', 'void-titan',
    ],
    // Nine HP is the twist; the opponent gets nine too. The old 9/12 split put a
    // good player on 31% and an average one on 15% — a wall, not a final exam.
    hp: [9, 9],
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
