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
 * Rebuilt in iteration 10 for the `closest` row rule (D-21). Under a plain sum
 * the pool was the fine lever and HP was a last resort; under this rule that is
 * reversed, and D-23 records why.
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

export const CAMPAIGN: readonly Encounter[] = [
  {
    id: 'cub',
    name: { ru: 'Волчонок', en: 'The Cub' },
    blurb: { ru: 'Только цифры. Не больше 11.', en: 'Numbers only. No more than 11.' },
    twist: { ru: 'У Волчонка 8 HP', en: 'The Cub has 8 HP' },
    difficulty: 'easy',
    // Nothing but vanilla: the first fight has no text to read at all.
    //
    // Two 4s are load-bearing and were not here before. The old pool topped out
    // at 4+3+3 = 10, which means **the row could not be overshot** — the first
    // encounter in a game about not going over 11 could not demonstrate going
    // over 11. It also had exactly one 4, so "take the 4" was right every time
    // and Stone Boar opened 95% of its rows.
    //
    // With two, 4+4+3 lands exactly and 4+4+4 busts, so the lesson is available
    // in the first row a player ever sees, and the top pick fell to 60%.
    pool: [
      'ember', 'cog', 'shade', 'wolf-pup', 'flame-hound',
      'iron-drone', 'wanderer', 'stone-boar', 'colossus', 'night-blade',
    ],
    hp: [11, 8],
  },
  {
    id: 'pack',
    name: { ru: 'Вожак стаи', en: 'Pack Leader' },
    blurb: { ru: 'Звери сильнее вместе.', en: 'Beasts are stronger together.' },
    twist: { ru: '', en: '' },
    difficulty: 'easy',
    // One axis only: Beast *faction*. The two extra vanillas over the previous
    // version are dilution — a synergy pool that always assembles is a pool
    // where the synergy is not a decision.
    //
    // The only encounter that needs no handicap at all: the pool alone lands it
    // where the curve wants it.
    pool: [
      'wolf-pup', 'stone-boar', 'pack-leader', 'beast-tamer', 'wanderer',
      'cog', 'shade', 'flame-hound', 'night-blade', 'ember', 'iron-drone',
    ],
  },
  {
    id: 'forge',
    name: { ru: 'Мастер-сборщик', en: 'The Assembler' },
    blurb: { ru: 'Считай механизмы, не силу.', en: 'Count the Machines, not the power.' },
    twist: { ru: 'У Сборщика 12 HP', en: 'The Assembler has 12 HP' },
    difficulty: 'easy',
    // Four Machines and the card that counts them.
    //
    // Diluting this pool was tried twice and moved it the wrong way both times
    // (83% -> 86% -> 90%): more small cards make a row easier to land on 11
    // exactly, which helps the better player more than the worse one. Hence the
    // HP handicap — see D-23.
    pool: [
      'cog', 'iron-drone', 'siege-core', 'assembler', 'wanderer',
      'ember', 'shade', 'wolf-pup', 'colossus', 'flame-hound',
    ],
    hp: [11, 12],
  },
  {
    id: 'pyre',
    name: { ru: 'Пиромант', en: 'The Pyromancer' },
    blurb: { ru: 'Огонь разгорается. Не сгори сам.', en: 'Fire grows. Do not overshoot.' },
    twist: { ru: 'У Пироманта 12 HP', en: 'The Pyromancer has 12 HP' },
    difficulty: 'normal',
    // Wildfire pays per Fire card, and under this rule that is a genuine trap:
    // the card that scales is the card that busts you. Five of the ten are Fire.
    //
    // Night Blade is here as a second 4 for the same reason the Cub has one —
    // with a single 4 in the pool it is taken on sight and nothing is decided.
    //
    // This is the encounter with the most knockouts (42%), and that is left
    // alone deliberately: the fight is about a scaling card overshooting, so
    // rows that end badly are the subject. Padding the pool with small cards to
    // calm it was tried and did the opposite — 88% for a good player and 63%
    // knockouts, the same inversion the Assembler showed (see D-23).
    pool: [
      'ember', 'cog', 'flame-hound', 'pyre-giant', 'night-blade',
      'wildfire', 'cinder-priest', 'shade', 'wolf-pup', 'wanderer',
    ],
    hp: [11, 12],
  },
  {
    id: 'thief',
    name: { ru: 'Тихий вор', en: 'The Quiet Thief' },
    blurb: { ru: 'Отбирай. Ему нужнее.', en: 'Take what they need.' },
    twist: { ru: 'У Вора 12 HP', en: 'The Thief has 12 HP' },
    difficulty: 'normal',
    // Shadow's weaken and peek: the fight where denying beats building. Weaken
    // got strictly better under this rule — it can no longer rescue a busted
    // opponent, so every point of it is pure subtraction — which is exactly the
    // lesson this encounter exists to teach.
    //
    // Siege Core is here as a second 4 rather than a twelfth small body: with
    // one, Stone Boar was taken on sight in 79% of the rows it appeared in and
    // the denial cards were competing for second place. With two it is 64%.
    pool: [
      'shade', 'night-blade', 'shadow-broker', 'nightmare', 'seer',
      'wanderer', 'cog', 'stone-boar', 'flame-hound', 'iron-drone', 'ember', 'siege-core',
    ],
    hp: [11, 12],
  },
  {
    id: 'sprint',
    name: { ru: 'Гонец', en: 'The Courier' },
    blurb: { ru: 'Три ряда. Ошибаться некогда.', en: 'Three rows. No room to misplay.' },
    twist: { ru: '3 ряда · 7 HP против 8', en: '3 rows · 7 HP against 8' },
    difficulty: 'normal',
    // Twelve cards for fifteen dealt: at three rows a bigger pool stops having
    // a face. Short and sharp — with damage capped at 5, seven HP is two bad
    // rows, which is the entire point of the encounter.
    pool: [
      'ember', 'cog', 'shade', 'wolf-pup', 'flame-hound', 'wanderer', 'stone-boar', 'colossus',
      'wildfire', 'pack-leader', 'assembler', 'quickstep',
    ],
    rounds: 3,
    hp: [7, 8],
  },
  {
    id: 'heavy',
    name: { ru: 'Тяжеловес', en: 'The Heavyweight' },
    blurb: { ru: 'Большая карта — почти перебор.', en: 'A big card is nearly a bust.' },
    twist: { ru: 'У Тяжеловеса 14 HP', en: 'The Heavyweight has 14 HP' },
    difficulty: 'normal',
    // The encounter this rule change broke worst, and then fixed.
    //
    // It used to be three 7-and-8 power tempo bombs plus five 4s. Under
    // `closest` that pool detonates: nearly every row busts somebody, each bust
    // is the full capped 5 damage, and it measured 99.0% for a good player with
    // 86% of matches ending by knockout. Not an encounter — a coin flip with
    // extra steps.
    //
    // Now: two big bodies and a deliberate floor of 1s and 2s, because an 8
    // under this rule is not a prize, it is a commitment to finding exactly 3
    // more. Bulwark is back after being barred from every pool in iteration 5
    // for opening 86-96% of its rows — the rule took care of that by itself
    // (its pick priority across the whole set fell from 72% to 34%).
    pool: [
      'warlord', 'bulwark', 'quickstep', 'herald', 'colossus', 'wanderer',
      'iron-drone', 'flame-hound', 'shade', 'wolf-pup', 'cog', 'ember',
    ],
    hp: [11, 14],
  },
  {
    id: 'archivist',
    name: { ru: 'Архивариус', en: 'The Archivist' },
    blurb: { ru: 'Он знает все карты. Ты тоже.', en: 'They know every card. So do you.' },
    twist: { ru: '', en: '' },
    difficulty: 'hard',
    // One card per lesson the campaign taught, each with the partner that lets
    // it fire: counting (Assembler + Siege Core), per-card scaling (Wildfire +
    // Flame Hound), faction synergy (Pack Leader + Wolf Pup), denial,
    // information, pick order.
    //
    // Void Titan is the one deliberate omission, and it is a measurement rather
    // than a taste: with it, an average player wins 11.5% of this fight; with a
    // plain Shade in its place, 26.4%. A 7-power tempo bomb under `closest`
    // costs a turn *and* eats most of a row's budget, and a player who cannot
    // price both at once is not being examined, only executed.
    //
    // No handicap: the finale is the one fight that should be a fair one.
    pool: [
      'wanderer', 'colossus', 'flame-hound', 'wolf-pup',
      'siege-core', 'assembler', 'wildfire', 'pack-leader',
      'nightmare', 'seer', 'herald', 'shade',
    ],
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
