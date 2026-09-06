import { describe, expect, it } from 'vitest';
import { isDisplayable } from './chars';
import { characterName, NAMED_COUNT, searchNames } from './names';

describe('characterName', () => {
  it('names the generated groups', () => {
    expect(characterName(0x41)).toBe('LATIN CAPITAL LETTER A');
    expect(characterName(0x7a)).toBe('LATIN SMALL LETTER Z');
    expect(characterName(0x30)).toBe('DIGIT ZERO');
    expect(characterName(0x39)).toBe('DIGIT NINE');
  });

  it('spells the Greek letters the way Unicode does, lamda and all', () => {
    expect(characterName(0x391)).toBe('GREEK CAPITAL LETTER ALPHA');
    expect(characterName(0x39b)).toBe('GREEK CAPITAL LETTER LAMDA');
    expect(characterName(0x3a9)).toBe('GREEK CAPITAL LETTER OMEGA');
    expect(characterName(0x3b1)).toBe('GREEK SMALL LETTER ALPHA');
    expect(characterName(0x3c9)).toBe('GREEK SMALL LETTER OMEGA');
    expect(characterName(0x3c2)).toBe('GREEK SMALL LETTER FINAL SIGMA');
    expect(characterName(0x3c3)).toBe('GREEK SMALL LETTER SIGMA');
  });

  it('steps over U+03A2, which is reserved', () => {
    expect(characterName(0x3a2)).toBeNull();
    expect(isDisplayable(0x3a2)).toBe(false);
  });

  it('names the curated symbols', () => {
    expect(characterName(0x2014)).toBe('EM DASH');
    expect(characterName(0x2013)).toBe('EN DASH');
    expect(characterName(0x00a0)).toBe('NO-BREAK SPACE');
    expect(characterName(0x20ac)).toBe('EURO SIGN');
    expect(characterName(0x2318)).toBe('PLACE OF INTEREST SIGN');
  });

  it('says nothing where this app has no name to give', () => {
    expect(characterName(0x4e00)).toBeNull();
    expect(characterName(0x1d400)).toBeNull();
    expect(characterName(0x0416)).toBeNull();
  });

  it('names only characters that exist', () => {
    for (let cp = 0; cp <= 0x2800; cp += 1) {
      if (characterName(cp) === null) continue;
      expect(isDisplayable(cp), cp.toString(16)).toBe(true);
    }
  });

  it('writes every name in the upper case Unicode uses', () => {
    for (let cp = 0; cp <= 0x2800; cp += 1) {
      const name = characterName(cp);
      if (name === null) continue;
      expect(name, name).toBe(name.toUpperCase());
      expect(name.trim(), name).toBe(name);
    }
  });

  it('counts what it can name', () => {
    expect(NAMED_COUNT).toBeGreaterThan(150);
  });
});

describe('searchNames', () => {
  it('finds a character by words from its name, in any order', () => {
    expect(searchNames('em dash')).toEqual([0x2014]);
    expect(searchNames('dash em')).toEqual([0x2014]);
    expect(searchNames('EM DASH')).toEqual([0x2014]);
  });

  it('returns every match, in code point order', () => {
    const hits = searchNames('quotation mark');
    expect(hits).toContain(0x22);
    expect(hits).toContain(0x201c);
    expect([...hits].sort((a, b) => a - b)).toEqual(hits);
  });

  it('needs every word to match', () => {
    expect(searchNames('greek omega')).toEqual([0x3a9, 0x3c9]);
    expect(searchNames('greek nonesuch')).toEqual([]);
  });

  it('has nothing to search for an empty query', () => {
    expect(searchNames('')).toEqual([]);
    expect(searchNames('   ')).toEqual([]);
  });

  it('caps what it returns', () => {
    expect(searchNames('LETTER', 5).length).toBe(5);
  });
});
