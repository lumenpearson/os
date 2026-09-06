import { describe, expect, it } from 'vitest';
import {
  charOf,
  cssEscape,
  DOTTED_CIRCLE,
  displayableRange,
  displayText,
  formatBytes,
  formatCodePoint,
  formatUnits,
  htmlNumeric,
  isCodePoint,
  isCombining,
  isDisplayable,
  jsEscape,
  MAX_CODE_POINT,
  utf8Bytes,
  utf16Units,
} from './chars';

describe('isCodePoint', () => {
  it('accepts the whole range and nothing outside it', () => {
    expect(isCodePoint(0)).toBe(true);
    expect(isCodePoint(MAX_CODE_POINT)).toBe(true);
    expect(isCodePoint(MAX_CODE_POINT + 1)).toBe(false);
    expect(isCodePoint(-1)).toBe(false);
    expect(isCodePoint(1.5)).toBe(false);
    expect(isCodePoint(Number.NaN)).toBe(false);
  });
});

describe('isDisplayable', () => {
  it('keeps characters a font can draw', () => {
    expect(isDisplayable(0x41)).toBe(true);
    expect(isDisplayable(0x2014)).toBe(true);
    expect(isDisplayable(0x1d400)).toBe(true);
  });

  it('drops controls, surrogates, unassigned code points and private use', () => {
    expect(isDisplayable(0x09)).toBe(false);
    expect(isDisplayable(0x7f)).toBe(false);
    expect(isDisplayable(0xd800)).toBe(false);
    expect(isDisplayable(0x0378)).toBe(false);
    expect(isDisplayable(0xe000)).toBe(false);
    expect(isDisplayable(0xfffe)).toBe(false);
  });

  it('keeps the invisible-but-assigned characters, which are real and copyable', () => {
    expect(isDisplayable(0x00a0)).toBe(true);
    expect(isDisplayable(0x200b)).toBe(true);
    expect(isDisplayable(0x200d)).toBe(true);
  });
});

describe('displayText', () => {
  it('is the character itself for anything that stands alone', () => {
    expect(displayText(0x2014)).toBe('—');
    expect(charOf(0x2014)).toBe('—');
  });

  it('puts a lone combining mark on a dotted circle', () => {
    expect(isCombining(0x0301)).toBe(true);
    expect(displayText(0x0301)).toBe(`${DOTTED_CIRCLE}́`);
    // What is copied stays the bare mark.
    expect(charOf(0x0301)).toBe('́');
  });
});

describe('formatCodePoint', () => {
  it('pads to four digits and no further', () => {
    expect(formatCodePoint(0x41)).toBe('U+0041');
    expect(formatCodePoint(0x2014)).toBe('U+2014');
    expect(formatCodePoint(0x1d400)).toBe('U+1D400');
    expect(formatCodePoint(0x10ffff)).toBe('U+10FFFF');
  });
});

describe('utf8Bytes', () => {
  it('encodes the four lengths', () => {
    expect(utf8Bytes(0x41)).toEqual([0x41]);
    expect(utf8Bytes(0x00e9)).toEqual([0xc3, 0xa9]);
    expect(utf8Bytes(0x2014)).toEqual([0xe2, 0x80, 0x94]);
    expect(utf8Bytes(0x1d400)).toEqual([0xf0, 0x9d, 0x90, 0x80]);
  });

  it('agrees with TextEncoder across the range', () => {
    const encoder = new TextEncoder();
    // A stride that is coprime with the block sizes, so the sweep does not
    // land on the same offset in every block.
    for (let cp = 0; cp <= 0x10ffff; cp += 977) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      expect(utf8Bytes(cp), formatCodePoint(cp)).toEqual([
        ...encoder.encode(String.fromCodePoint(cp)),
      ]);
    }
  });

  it('has nothing to encode outside the range', () => {
    expect(utf8Bytes(-1)).toEqual([]);
  });
});

describe('utf16Units', () => {
  it('is one unit in the BMP and a surrogate pair above it', () => {
    expect(utf16Units(0x2014)).toEqual([0x2014]);
    expect(utf16Units(0x10000)).toEqual([0xd800, 0xdc00]);
    expect(utf16Units(0x1d400)).toEqual([0xd835, 0xdc00]);
    expect(utf16Units(0x10ffff)).toEqual([0xdbff, 0xdfff]);
  });

  it('agrees with how JavaScript itself stores the string', () => {
    for (let cp = 0; cp <= 0x10ffff; cp += 1013) {
      if (cp >= 0xd800 && cp <= 0xdfff) continue;
      const text = String.fromCodePoint(cp);
      expect(utf16Units(cp), formatCodePoint(cp)).toEqual(
        Array.from({ length: text.length }, (_, i) => text.charCodeAt(i)),
      );
    }
  });
});

describe('the printed forms', () => {
  it('prints bytes and units in hex, fixed width', () => {
    expect(formatBytes([0xe2, 0x80, 0x94])).toBe('E2 80 94');
    expect(formatBytes([0x0a])).toBe('0A');
    expect(formatUnits([0xd835, 0xdc00])).toBe('D835 DC00');
  });

  it('writes the numeric HTML reference, which every character has', () => {
    expect(htmlNumeric(0x2014)).toBe('&#8212;');
    expect(htmlNumeric(0x41)).toBe('&#65;');
  });

  it('writes a JavaScript escape a person can paste', () => {
    expect(jsEscape(0x2014)).toBe('\\u2014');
    expect(jsEscape(0x0a)).toBe('\\u000A');
    expect(jsEscape(0x1d400)).toBe('\\u{1D400}');
  });

  it('pads the CSS escape to six digits so it cannot run into what follows', () => {
    expect(cssEscape(0x2014)).toBe('\\002014');
    expect(cssEscape(0x1d400)).toBe('\\01D400');
    expect(cssEscape(0x41)).toBe('\\000041');
  });
});

describe('displayableRange', () => {
  it('returns the drawable code points in order', () => {
    const latin = displayableRange(0x0000, 0x007f);
    expect(latin.length).toBe(95);
    expect(latin[0]).toBe(0x20);
    expect(latin[latin.length - 1]).toBe(0x7e);
  });

  it('leaves nothing out of a fully assigned block', () => {
    expect(displayableRange(0x2500, 0x257f).length).toBe(128);
  });

  it('answers the same range with the same array, which is what makes it cheap', () => {
    expect(displayableRange(0x2190, 0x21ff)).toBe(displayableRange(0x2190, 0x21ff));
  });

  it('is empty when the range is inside out', () => {
    expect(displayableRange(0x30, 0x20)).toEqual([]);
  });
});
