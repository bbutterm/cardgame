import { describe, expect, it } from 'vitest';
import { ALL_CARDS, getCard, LOCALES } from '@delezh/cards';
import { createMatch, resolveLines, type CardInstance } from '@delezh/engine';
import { EMOTE_KEYS } from '@delezh/protocol';
import { ru } from '../src/i18n/ru.js';
import { en } from '../src/i18n/en.js';
import { projectedTotal, rowTotalOf } from '../src/components/RowTotal.js';

/** Card instances for a hypothetical row, without spinning up a match. */
function hand(...cardIds: string[]): CardInstance[] {
  return cardIds.map((cardId, i) => ({ uid: `h${i}`, cardId, row: 0, slot: i }));
}

describe('i18n dictionaries', () => {
  it('are at exact key parity', () => {
    const ruKeys = Object.keys(ru).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(ruKeys);
  });

  it('have no empty strings', () => {
    for (const [key, value] of Object.entries({ ...ru, ...en })) {
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it('use the same placeholders in both locales', () => {
    const placeholders = (text: string) => (text.match(/\{(\w+)\}/g) ?? []).sort();
    for (const key of Object.keys(ru) as Array<keyof typeof ru>) {
      // A translation that drops a placeholder renders a literal "{seconds}".
      expect(placeholders(en[key]), `${key} placeholders`).toEqual(placeholders(ru[key]));
    }
  });

  it('cover every emote the protocol allows', () => {
    for (const key of EMOTE_KEYS) expect(ru).toHaveProperty(key);
  });

  it('cover every faction, so the board can name its own colours', () => {
    for (const card of ALL_CARDS) expect(ru).toHaveProperty(`faction.${card.faction}`);
  });
});

describe('row totals', () => {
  it('match what the battle resolver will compute', () => {
    // The preview must not drift from the fight: same inputs, same engine call.
    const mine = hand('pyre-giant', 'wildfire');
    const theirs = hand('colossus');
    const expected = resolveLines(
      mine.map((c) => getCard(c.cardId)),
      theirs.map((c) => getCard(c.cardId)),
    ).reduce((sum, line) => sum + line.total, 0);

    expect(rowTotalOf(mine, theirs)).toBe(expected);
  });

  it('counts synergies rather than just adding printed numbers', () => {
    const beast = hand('wolf-pup');
    const leader = { uid: 'x', cardId: 'pack-leader', row: 0, slot: 1 };
    const leaderCard = getCard('pack-leader');

    // Pack Leader alone is its printed power; beside a Beast it is worth more.
    expect(rowTotalOf(hand('pack-leader'), [])).toBe(leaderCard.power);
    expect(projectedTotal(beast, [], leader)).toBeGreaterThan(
      rowTotalOf(beast, []) + leaderCard.power,
    );
  });

  it('projects exactly the row the pick would produce', () => {
    const mine = hand('ember', 'flame-hound');
    const theirs = hand('shade');
    const candidate = { uid: 'c', cardId: 'wildfire', row: 0, slot: 4 };
    expect(projectedTotal(mine, theirs, candidate)).toBe(rowTotalOf([...mine, candidate], theirs));
  });

  it('is zero for an empty row', () => {
    expect(rowTotalOf([], [])).toBe(0);
  });
});

describe('card presentation contract', () => {
  it('every shipped card has a face the UI can render', () => {
    for (const card of ALL_CARDS) {
      for (const locale of LOCALES) {
        expect(card.name[locale].length, `${card.id} name`).toBeGreaterThan(0);
      }
      // `art` is the slot real illustrations drop into; undefined means the
      // procedural generator handles it. Anything else would break <CardArt>.
      expect(card.art === undefined || typeof card.art === 'string').toBe(true);
    }
  });

  it('a fresh match only ever references known cards', () => {
    const { state } = createMatch({ seed: 'client-render', firstPicker: 0 });
    for (const row of state.rows) {
      for (const instance of row) expect(() => getCard(instance.cardId)).not.toThrow();
    }
  });
});
