import { describe, expect, it } from 'vitest';
import { ALL_CARDS, EFFECT_KINDS, LOCALES } from '@delezh/cards';
import { COVERED_IN_BATTLE, COVERED_IN_MATCH } from './covered.js';

describe('effect coverage', () => {
  it('every effect kind has a dedicated test', () => {
    const tested = new Set([...COVERED_IN_BATTLE, ...COVERED_IN_MATCH]);
    const missing = EFFECT_KINDS.filter((kind) => !tested.has(kind));
    expect(missing).toEqual([]);
  });

  it('every effect used by a shipped card is a known kind', () => {
    const known = new Set<string>(EFFECT_KINDS);
    for (const card of ALL_CARDS) {
      for (const effect of card.effects) {
        expect(known.has(effect.kind), `${card.id} uses unknown effect ${effect.kind}`).toBe(true);
      }
    }
  });
});

describe('card data integrity', () => {
  it('has unique ids', () => {
    const ids = ALL_CARDS.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps rules text under nine words in every locale', () => {
    for (const card of ALL_CARDS) {
      for (const locale of LOCALES) {
        const words = card.text[locale].trim().split(/\s+/).filter(Boolean);
        expect(words.length, `${card.id} [${locale}] "${card.text[locale]}"`).toBeLessThanOrEqual(8);
      }
    }
  });

  it('names and texts are localized in every locale', () => {
    for (const card of ALL_CARDS) {
      for (const locale of LOCALES) {
        expect(card.name[locale].length, `${card.id} name [${locale}]`).toBeGreaterThan(0);
        // A card with effects must explain itself; a vanilla card must not.
        const hasText = card.text[locale].trim().length > 0;
        const needsText = card.effects.length > 0;
        expect(hasText, `${card.id} [${locale}] text/effects mismatch`).toBe(needsText);
      }
    }
  });

  it('uses sane weights, copies and power', () => {
    for (const card of ALL_CARDS) {
      expect(card.weight, card.id).toBeGreaterThan(0);
      expect(card.maxCopies, card.id).toBeGreaterThanOrEqual(1);
      expect(card.power, card.id).toBeGreaterThanOrEqual(0);
      expect(card.power, card.id).toBeLessThanOrEqual(12);
    }
  });

  it('ships the promised starter composition', () => {
    const base = ALL_CARDS.filter((c) => !c.experimental);
    expect(base.length).toBe(30);
    expect(base.filter((c) => c.effects.length === 0).length).toBe(12);
    expect(base.filter((c) => c.effects.some((e) => e.kind === 'skipNextPick')).length).toBe(4);
  });
});
