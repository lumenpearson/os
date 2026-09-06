import { describe, expect, it } from 'vitest';
import { formatCodePoint, isDisplayable } from './chars';
import { parseQuery, searchCharacters } from './search';

describe('searching by code point', () => {
  it('takes the notations tools print', () => {
    expect(searchCharacters('U+2014')[0]).toBe(0x2014);
    expect(searchCharacters('u+2014')[0]).toBe(0x2014);
    expect(searchCharacters('0x2014')[0]).toBe(0x2014);
    expect(searchCharacters('\\u2014')[0]).toBe(0x2014);
    expect(searchCharacters('\\u{1D400}')[0]).toBe(0x1d400);
    expect(searchCharacters('&#8212;')[0]).toBe(0x2014);
    expect(searchCharacters('&#x2014;')[0]).toBe(0x2014);
  });

  it('reads a bare number as hex first, then as decimal', () => {
    const hex = searchCharacters('2014');
    expect(hex[0]).toBe(0x2014);
    expect(hex).toContain(2014);

    // 8212 is the em dash in decimal and a CJK ideograph in hex; both are shown.
    const both = searchCharacters('8212');
    expect(both[0]).toBe(0x8212);
    expect(both).toContain(0x2014);
  });

  it('ignores surrounding space', () => {
    expect(searchCharacters('  U+2014  ')[0]).toBe(0x2014);
  });

  it('finds nothing for a number past the last code point', () => {
    expect(searchCharacters('U+110000')).toEqual([]);
    expect(parseQuery('U+110000')).toEqual([]);
  });
});

describe('searching by entity name', () => {
  it('takes the reference with or without its punctuation', () => {
    expect(searchCharacters('&mdash;')[0]).toBe(0x2014);
    expect(searchCharacters('mdash;')[0]).toBe(0x2014);
    expect(searchCharacters('mdash')[0]).toBe(0x2014);
    expect(searchCharacters('&nbsp;')[0]).toBe(0x00a0);
  });
});

describe('searching by name', () => {
  it('matches the names this app can state', () => {
    expect(searchCharacters('em dash')).toEqual([0x2014]);
    expect(searchCharacters('euro sign')).toEqual([0x20ac]);
  });

  it('does not search names for a bare number, which has no words in it', () => {
    expect(searchCharacters('2014')).not.toContain(0x32);
  });
});

describe('searching by the character itself', () => {
  it('finds a pasted character', () => {
    expect(searchCharacters('—')[0]).toBe(0x2014);
    expect(searchCharacters('é')[0]).toBe(0x00e9);
    expect(searchCharacters('𝐀')[0]).toBe(0x1d400);
  });

  it('finds every displayable character when it is pasted in', () => {
    for (let cp = 0x21; cp <= 0x10ffff; cp += 733) {
      if (!isDisplayable(cp)) continue;
      const char = String.fromCodePoint(cp);
      if (char.trim() === '') continue;
      expect(searchCharacters(char), formatCodePoint(cp)).toContain(cp);
    }
  });

  it('finds every character written as U+XXXX', () => {
    for (let cp = 0x21; cp <= 0x10ffff; cp += 733) {
      if (!isDisplayable(cp)) continue;
      expect(searchCharacters(formatCodePoint(cp))[0], formatCodePoint(cp)).toBe(cp);
    }
  });

  it('does not pull the letters out of a phrase', () => {
    expect(searchCharacters('em dash')).not.toContain(0x65);
  });
});

describe('what search leaves out', () => {
  it('has nothing to say about an empty query', () => {
    expect(searchCharacters('')).toEqual([]);
    expect(searchCharacters('   ')).toEqual([]);
  });

  it('drops code points with nothing to draw', () => {
    // U+0009 is a control, U+D800 a surrogate half, U+0378 unassigned.
    expect(searchCharacters('U+0009')).toEqual([]);
    expect(searchCharacters('U+D800')).toEqual([]);
    expect(searchCharacters('U+0378')).toEqual([]);
    // The parse still found them; only the display rule removed them.
    expect(parseQuery('U+0009')).toEqual([0x09]);
  });

  it('never repeats a code point two notations agree on', () => {
    const hits = searchCharacters('mdash');
    expect(hits.filter((cp) => cp === 0x2014)).toHaveLength(1);
  });
});
