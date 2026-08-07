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

/**
 * Guards against the dictionaries rotting in either direction. The reviewer
 * found 24 keys with no reference, and several turned out to be missing
 * *features* rather than dead strings — a written-but-never-rendered
 * "Leave? This counts as a loss." confirmation, for one.
 */
describe('dictionary is fully wired', () => {
  /** Keys built at runtime from a variable, which a text scan cannot see. */
  const DYNAMIC = [
    /^difficulty\./, // `difficulty.${level}` and `.hint`
    /^faction\./, // `faction.${card.faction}`
    /^tutorial\.s\d/, // `tutorial.s${step + 1}.title`
    /^battle\.round/, // chosen from a verdict variable
    /^result\.(victory|defeat|draw)$/, // chosen from a headline variable
    /^emote\./, // iterated from EMOTE_KEYS
    /^online\.(roomFull|roomNotFound)$/, // set as an error message
    /^error\./, // set as an error message
  ];

  it('references every key somewhere in the source', async () => {
    const { readdir, readFile } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');

    const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
    const walk = async (dir: string): Promise<string[]> => {
      const entries = await readdir(dir, { withFileTypes: true });
      const out: string[] = [];
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...(await walk(full)));
        else if (/\.tsx?$/.test(entry.name) && !/i18n[\\/](ru|en)\.ts$/.test(full)) out.push(full);
      }
      return out;
    };

    const files = await walk(root);
    const source = (await Promise.all(files.map((f) => readFile(f, 'utf8')))).join('\n');

    const unused = Object.keys(ru).filter(
      (key) => !source.includes(`'${key}'`) && !DYNAMIC.some((pattern) => pattern.test(key)),
    );
    expect(unused).toEqual([]);
  });
});
