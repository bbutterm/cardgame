import type { CardDef } from './types.js';

/**
 * Starter set: 30 cards.
 *
 *   12 vanilla  — raw power, no rules text (readability anchor for new players)
 *   10 synergy  — reward tag / faction clusters inside a single row
 *    4 tempo    — strong bodies that cost you your next pick
 *    4 control  — bend pick order, information, or catch-up
 *
 * `weight` is the relative chance of entering a match pool; `maxCopies` caps how
 * often one card can appear in the same 25-card pool. Cheap/simple cards carry
 * high weights so a pool stays legible; epics are near-singletons.
 *
 * Rules text is capped at 8 words per locale so it stays readable at 360px.
 */
export const CARDS: readonly CardDef[] = [
  // ---------------------------------------------------------------- vanilla
  {
    id: 'ember',
    name: { ru: 'Уголёк', en: 'Ember' },
    text: { ru: '', en: '' },
    power: 1,
    faction: 'fire',
    rarity: 'common',
    tags: ['swarm', 'spark'],
    weight: 10,
    maxCopies: 3,
    effects: [],
  },
  {
    id: 'cog',
    name: { ru: 'Шестерня', en: 'Cog' },
    text: { ru: '', en: '' },
    power: 1,
    faction: 'machine',
    rarity: 'common',
    tags: ['swarm', 'construct'],
    weight: 10,
    maxCopies: 3,
    effects: [],
  },
  {
    id: 'shade',
    name: { ru: 'Тень', en: 'Shade' },
    text: { ru: '', en: '' },
    power: 2,
    faction: 'shadow',
    rarity: 'common',
    tags: ['swarm', 'omen'],
    weight: 9,
    maxCopies: 3,
    effects: [],
  },
  {
    id: 'wolf-pup',
    name: { ru: 'Волчонок', en: 'Wolf Pup' },
    text: { ru: '', en: '' },
    power: 2,
    faction: 'beast',
    rarity: 'common',
    tags: ['swarm'],
    weight: 9,
    maxCopies: 3,
    effects: [],
  },
  {
    id: 'flame-hound',
    name: { ru: 'Пламенный пёс', en: 'Flame Hound' },
    text: { ru: '', en: '' },
    power: 3,
    faction: 'fire',
    rarity: 'common',
    tags: ['hunter'],
    weight: 8,
    maxCopies: 3,
    effects: [],
  },
  {
    id: 'iron-drone',
    name: { ru: 'Железный дрон', en: 'Iron Drone' },
    text: { ru: '', en: '' },
    power: 3,
    faction: 'machine',
    rarity: 'common',
    tags: ['construct'],
    weight: 8,
    maxCopies: 3,
    effects: [],
  },
  {
    id: 'wanderer',
    name: { ru: 'Странник', en: 'Wanderer' },
    text: { ru: '', en: '' },
    power: 3,
    faction: 'neutral',
    rarity: 'common',
    tags: [],
    weight: 8,
    maxCopies: 3,
    effects: [],
  },
  {
    id: 'night-blade',
    name: { ru: 'Ночной клинок', en: 'Night Blade' },
    text: { ru: '', en: '' },
    power: 4,
    faction: 'shadow',
    rarity: 'common',
    tags: ['hunter'],
    weight: 6,
    maxCopies: 2,
    effects: [],
  },
  {
    id: 'stone-boar',
    name: { ru: 'Каменный вепрь', en: 'Stone Boar' },
    text: { ru: '', en: '' },
    power: 4,
    faction: 'beast',
    rarity: 'common',
    tags: [],
    weight: 6,
    maxCopies: 2,
    effects: [],
  },
  {
    id: 'siege-core',
    name: { ru: 'Осадное ядро', en: 'Siege Core' },
    text: { ru: '', en: '' },
    power: 4,
    faction: 'machine',
    rarity: 'rare',
    tags: ['construct'],
    weight: 7,
    maxCopies: 3,
    effects: [],
  },
  {
    id: 'colossus',
    name: { ru: 'Колосс', en: 'Colossus' },
    text: { ru: '', en: '' },
    power: 4,
    faction: 'neutral',
    rarity: 'rare',
    tags: [],
    weight: 7,
    maxCopies: 3,
    effects: [],
  },
  {
    id: 'pyre-giant',
    name: { ru: 'Костровой гигант', en: 'Pyre Giant' },
    text: { ru: '', en: '' },
    power: 4,
    faction: 'fire',
    rarity: 'rare',
    tags: [],
    weight: 6,
    maxCopies: 3,
    effects: [],
  },

  // ---------------------------------------------------------------- synergy
  {
    id: 'pack-leader',
    name: { ru: 'Вожак стаи', en: 'Pack Leader' },
    text: { ru: '+3, если рядом Зверь', en: '+3 if you have a Beast' },
    power: 2,
    faction: 'beast',
    rarity: 'common',
    tags: ['hunter'],
    weight: 7,
    maxCopies: 2,
    // Same shape as Spark Relay and the same fix: a conditional that turns a 2
    // into a 6 is a card you often cannot afford to play. 45.3% → 47.5%.
    effects: [
      { kind: 'powerIf', amount: 3, cond: { type: 'count', counter: { scope: 'self', faction: 'beast', excludeSelf: true } } },
    ],
  },
  {
    id: 'wildfire',
    name: { ru: 'Пожар', en: 'Wildfire' },
    text: { ru: '+2 за каждую карту Огня', en: '+2 per Fire card' },
    power: 1,
    faction: 'fire',
    rarity: 'common',
    tags: ['spark'],
    weight: 7,
    maxCopies: 2,
    effects: [{ kind: 'powerPer', amount: 2, counter: { scope: 'self', faction: 'fire' } }],
  },
  {
    id: 'shadow-broker',
    name: { ru: 'Теневой маклер', en: 'Shadow Broker' },
    text: { ru: '+3 за каждую другую Тень', en: '+3 per other Shadow card' },
    power: 2,
    faction: 'shadow',
    rarity: 'common',
    tags: ['omen'],
    weight: 7,
    maxCopies: 2,
    effects: [
      { kind: 'powerPer', amount: 3, counter: { scope: 'self', faction: 'shadow', excludeSelf: true } },
    ],
  },
  {
    id: 'assembler',
    name: { ru: 'Сборщик', en: 'Assembler' },
    text: { ru: '+3 за каждый другой Механизм', en: '+3 per other Machine card' },
    power: 2,
    faction: 'machine',
    rarity: 'common',
    tags: ['construct'],
    weight: 7,
    maxCopies: 2,
    effects: [
      { kind: 'powerPer', amount: 3, counter: { scope: 'self', faction: 'machine', excludeSelf: true } },
    ],
  },
  {
    id: 'beast-tamer',
    name: { ru: 'Укротитель', en: 'Beast Tamer' },
    text: { ru: '+6, если рядом два Зверя', en: '+6 if you have two Beasts' },
    power: 2,
    faction: 'neutral',
    rarity: 'rare',
    tags: ['hunter'],
    weight: 5,
    maxCopies: 2,
    effects: [
      {
        kind: 'powerIf',
        amount: 6,
        cond: { type: 'count', counter: { scope: 'self', faction: 'beast', excludeSelf: true }, min: 2 },
      },
    ],
  },
  {
    id: 'spark-relay',
    name: { ru: 'Искровое реле', en: 'Spark Relay' },
    text: { ru: '+3, если рядом карта Огня', en: '+3 if you have a Fire card' },
    power: 2,
    faction: 'machine',
    rarity: 'common',
    tags: ['spark', 'construct'],
    weight: 6,
    maxCopies: 2,
    // Its condition is the easiest in the set, so it plays as its bonus almost
    // every time — and at +4 that is a 6, which is over half a row's budget
    // under `closest`. It read 44.0%; at +3 it reads 48.3%.
    effects: [
      { kind: 'powerIf', amount: 3, cond: { type: 'count', counter: { scope: 'self', faction: 'fire' } } },
    ],
  },
  {
    id: 'swarm-rat',
    name: { ru: 'Крысиный рой', en: 'Swarm Rat' },
    text: { ru: '+3 за каждую другую Стаю', en: '+3 per other Swarm card' },
    power: 1,
    faction: 'beast',
    rarity: 'common',
    tags: ['swarm'],
    weight: 7,
    maxCopies: 2,
    effects: [{ kind: 'powerPer', amount: 3, counter: { scope: 'self', tag: 'swarm', excludeSelf: true } }],
  },
  {
    id: 'nightmare',
    name: { ru: 'Кошмар', en: 'Nightmare' },
    text: { ru: 'Оппонент теряет 1 силу', en: 'Opponent loses 1 power' },
    power: 2,
    faction: 'shadow',
    rarity: 'rare',
    tags: ['omen'],
    weight: 5,
    maxCopies: 2,
    // Under `closest` weaken never rescues a busted side and can only push the
    // opponent away from the target, so it gained a point of value for free:
    // at 2 this read 56.7% (58.0% on one seed). One is the ceiling now.
    effects: [{ kind: 'weaken', amount: 1 }],
  },
  {
    id: 'mirror-idol',
    name: { ru: 'Зеркальный идол', en: 'Mirror Idol' },
    text: { ru: 'Сила равна сильнейшей твоей карте', en: 'Power equals your strongest other card' },
    power: 1,
    faction: 'neutral',
    rarity: 'rare',
    tags: ['relic'],
    weight: 4,
    maxCopies: 2,
    effects: [{ kind: 'mirrorStrongest' }],
  },
  {
    id: 'cinder-priest',
    name: { ru: 'Жрец пепла', en: 'Cinder Priest' },
    text: { ru: '2 урона напрямую', en: 'Deal 2 damage directly' },
    power: 1,
    faction: 'fire',
    rarity: 'rare',
    tags: ['spark'],
    weight: 5,
    maxCopies: 2,
    effects: [{ kind: 'burn', amount: 2 }],
  },

  // ------------------------------------------------------------------ tempo
  {
    id: 'warlord',
    name: { ru: 'Полководец', en: 'Warlord' },
    text: { ru: 'Пропусти следующий пик', en: 'Skip your next pick' },
    // 8 under `sum`, where it was the biggest number in the game. Under
    // `closest` an 8 has to find a 3 to be worth anything and a bare 7 reads
    // 51.0% against 54.1% — so the three skip-only epics are now one cycle at
    // 7 (fire / shadow / beast) and Bulwark keeps the unique 8.
    power: 7,
    faction: 'fire',
    rarity: 'epic',
    tags: [],
    weight: 3,
    maxCopies: 1,
    effects: [{ kind: 'skipNextPick' }],
  },
  {
    id: 'void-titan',
    name: { ru: 'Титан пустоты', en: 'Void Titan' },
    text: { ru: 'Пропусти следующий пик', en: 'Skip your next pick' },
    power: 7,
    faction: 'shadow',
    rarity: 'epic',
    tags: ['omen'],
    weight: 3,
    maxCopies: 1,
    effects: [{ kind: 'skipNextPick' }],
  },
  {
    id: 'apex-beast',
    name: { ru: 'Альфа-хищник', en: 'Apex Beast' },
    text: { ru: 'Пропусти следующий пик', en: 'Skip your next pick' },
    power: 7,
    faction: 'beast',
    rarity: 'epic',
    tags: ['hunter'],
    weight: 3,
    maxCopies: 1,
    effects: [{ kind: 'skipNextPick' }],
  },
  {
    id: 'bulwark',
    name: { ru: 'Бастион', en: 'Bulwark' },
    text: { ru: 'Щит 1. Пропусти следующий пик', en: 'Shield 1. Skip your next pick' },
    power: 8,
    faction: 'machine',
    rarity: 'rare',
    tags: ['construct'],
    // 4 → 6 for sample, not for strength. On the match metric a card drafted in
    // a third of the deals cannot be resolved by an 800-match regression run —
    // this one read 39.9% there against a true 47–48% over 10,000 matches, and
    // one seed of the extended pool put it at 41.1%. At 6 the sample is 1,690
    // rows instead of 990 and the readings stop bouncing.
    weight: 6,
    maxCopies: 2,
    // Under `closest` the shield on this body is a trap, and the sign is not
    // subtle: at shield 3 the card reads 44.4% and drops out of the corridor on
    // some seeds, at 1 it reads 47.3%, and with no shield at all 50.3%. Shield
    // can never cost its holder HP, so the whole effect is on the *pick* — the
    // bot pays priority for a shield and then eats an 8-power body plus a
    // skipped pick, which is a bad trade at a row target of 11. The body itself
    // is not the problem: 5, 6, 7 and 9 power all measure worse than 8, because
    // the tempo debt is a flat cost and only a big body can pay it.
    //
    // 1 is the smallest shippable shield. Removing it outright measures better
    // still, and is not done here because it would leave Bulwark rules-identical
    // to Warlord — see the report notes on the bot's shield valuation.
    effects: [{ kind: 'shield', amount: 1 }, { kind: 'skipNextPick' }],
  },

  // ---------------------------------------------------------------- control
  {
    id: 'herald',
    name: { ru: 'Герольд', en: 'Herald' },
    text: { ru: 'Пикаешь первым в следующем ряду', en: 'You pick first next row' },
    power: 2,
    faction: 'neutral',
    rarity: 'rare',
    tags: [],
    weight: 5,
    maxCopies: 2,
    effects: [{ kind: 'firstPickerSelf' }],
  },
  {
    id: 'seer',
    name: { ru: 'Провидец', en: 'Seer' },
    text: { ru: 'Посмотри следующий ряд', en: 'Peek at the next row' },
    power: 3,
    faction: 'shadow',
    rarity: 'common',
    tags: ['omen'],
    weight: 6,
    maxCopies: 2,
    effects: [{ kind: 'revealNextRow' }],
  },
  {
    id: 'quickstep',
    name: { ru: 'Рывок', en: 'Quickstep' },
    text: { ru: 'Возьми ещё одну карту', en: 'Take another card right now' },
    power: 0,
    faction: 'neutral',
    rarity: 'rare',
    tags: [],
    weight: 4,
    maxCopies: 2,
    effects: [{ kind: 'extraPick' }],
  },
  {
    id: 'oracle-coin',
    name: { ru: 'Монета оракула', en: 'Oracle Coin' },
    text: { ru: 'Восстанови 1 HP', en: 'Restore 1 HP' },
    power: 2,
    faction: 'neutral',
    rarity: 'rare',
    tags: ['relic'],
    weight: 5,
    maxCopies: 2,
    // `maxRoundDamage: 5` repriced every flat-HP effect: healing 2 is now worth
    // 40% of the worst row you can lose, where under uncapped damage it was a
    // rounding error. At 2 the card read 56.5% and was the widest in the base
    // set; at 1 it reads 51.6%.
    effects: [{ kind: 'heal', amount: 1 }],
  },
];
