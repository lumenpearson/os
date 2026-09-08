/**
 * What can be derived about a character without a character database.
 *
 * The system ships no copy of UnicodeData.txt, so everything in here is
 * computed from the code point itself — the encodings, the escapes, the
 * numeric entity — or read from the JavaScript engine's own Unicode tables
 * through property escapes. Names and named entities are not derivable; they
 * live in `names.ts` and `entities.ts`, both hand-written, and a character
 * missing from those lists simply has no name here.
 */

/**
 * Code points with nothing to draw: control characters, surrogate halves,
 * unassigned code points and private use. Rendering these fills the grid with
 * replacement boxes that mean nothing, so they are left out and counted
 * instead. `\p{…}` reads the engine's Unicode tables, which is the only
 * assignment data this app has.
 */
const NOTHING_TO_DRAW = /[\p{Cc}\p{Cs}\p{Cn}\p{Co}]/u;

/** A mark that renders on top of the previous character rather than alone. */
const COMBINING = /[\p{Mn}\p{Mc}\p{Me}]/u;

/** U+25CC DOTTED CIRCLE: the placeholder a lone combining mark is shown on. */
export const DOTTED_CIRCLE = '◌';

export const MAX_CODE_POINT = 0x10ffff;

export function isCodePoint(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_CODE_POINT;
}

/** Whether the engine has a character here that a font could draw. */
export function isDisplayable(codePoint: number): boolean {
  if (!isCodePoint(codePoint)) return false;
  return !NOTHING_TO_DRAW.test(String.fromCodePoint(codePoint));
}

export function isCombining(codePoint: number): boolean {
  if (!isCodePoint(codePoint)) return false;
  return COMBINING.test(String.fromCodePoint(codePoint));
}

/** The character itself: what goes on the clipboard. */
export function charOf(codePoint: number): string {
  return isCodePoint(codePoint) ? String.fromCodePoint(codePoint) : '';
}

/**
 * What the grid draws. A combining mark on its own has nothing to combine
 * with and lands wherever the shaper puts it, so it is drawn on a dotted
 * circle — the convention every character map uses. Only the display changes;
 * copying still yields the bare mark.
 */
export function displayText(codePoint: number): string {
  const char = charOf(codePoint);
  return isCombining(codePoint) ? DOTTED_CIRCLE + char : char;
}

/** `U+2014`, `U+00A0`, `U+1D400` — at least four digits, as Unicode writes them. */
export function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
}

/**
 * The UTF-8 encoding of one code point. Written out rather than taken from
 * TextEncoder so the arithmetic is visible and testable; the test checks it
 * against TextEncoder across the whole range.
 */
export function utf8Bytes(codePoint: number): number[] {
  if (!isCodePoint(codePoint)) return [];
  if (codePoint < 0x80) return [codePoint];
  if (codePoint < 0x800) {
    return [0xc0 | (codePoint >> 6), 0x80 | (codePoint & 0x3f)];
  }
  if (codePoint < 0x10000) {
    return [0xe0 | (codePoint >> 12), 0x80 | ((codePoint >> 6) & 0x3f), 0x80 | (codePoint & 0x3f)];
  }
  return [
    0xf0 | (codePoint >> 18),
    0x80 | ((codePoint >> 12) & 0x3f),
    0x80 | ((codePoint >> 6) & 0x3f),
    0x80 | (codePoint & 0x3f),
  ];
}

/** The UTF-16 code units: one, or a surrogate pair above the BMP. */
export function utf16Units(codePoint: number): number[] {
  if (!isCodePoint(codePoint)) return [];
  if (codePoint < 0x10000) return [codePoint];
  const offset = codePoint - 0x10000;
  return [0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff)];
}

/** `E2 80 94` — bytes in hex, two digits each. */
export function formatBytes(bytes: readonly number[]): string {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

/** `D835 DC00` — UTF-16 code units in hex, four digits each. */
export function formatUnits(units: readonly number[]): string {
  return units.map((u) => u.toString(16).toUpperCase().padStart(4, '0')).join(' ');
}

/** `&#8212;` — the numeric reference, which exists for every character. */
export function htmlNumeric(codePoint: number): string {
  return `&#${codePoint};`;
}

/**
 * A JavaScript string escape. Below the BMP a plain `\uXXXX` is exact; above
 * it the brace form is used rather than a surrogate pair, because that is
 * what a person pasting into source wants to read.
 */
export function jsEscape(codePoint: number): string {
  if (codePoint < 0x10000) return `\\u${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
  return `\\u{${codePoint.toString(16).toUpperCase()}}`;
}

/**
 * A CSS escape, padded to six digits. CSS ends a shorter escape at the first
 * non-hex character, so `\2014` followed by a digit means something else
 * entirely; six digits can never run on and needs no trailing space.
 */
export function cssEscape(codePoint: number): string {
  return `\\${codePoint.toString(16).toUpperCase().padStart(6, '0')}`;
}

/**
 * The displayable code points in a range, in order.
 *
 * Blocks are scanned once and kept: CJK Unified Ideographs is 20,992 code
 * points and Hangul Syllables 11,172, and re-testing every one of them on
 * each render would cost a frame for nothing.
 */
const scanned = new Map<string, readonly number[]>();

export function displayableRange(start: number, end: number): readonly number[] {
  const key = `${start}:${end}`;
  const cached = scanned.get(key);
  if (cached) return cached;
  const found: number[] = [];
  for (let cp = start; cp <= end; cp += 1) {
    if (isDisplayable(cp)) found.push(cp);
  }
  const frozen: readonly number[] = found;
  scanned.set(key, frozen);
  return frozen;
}
