/**
 * Finding a character.
 *
 * A person arrives with one of a few things in hand: a code point written the
 * way some tool prints it (`U+2014`, `0x2014`, `—`, `&#8212;`), a bare
 * number that could be either hex or decimal, an entity name, a word from a
 * name, or the character itself, pasted. Each of those is tried, and the
 * results are the union — a bare `2014` is both U+2014 and decimal 2014, and
 * saying so is more honest than picking one and being silently wrong.
 *
 * Only characters the map can draw are returned; the rest are dropped the
 * same way they are dropped from a block.
 */

import { isCodePoint, isDisplayable } from './chars';
import { entityCodePoint } from './entities';
import { searchNames } from './names';

/** Beyond this the result grid stops being a list of answers. */
export const RESULT_LIMIT = 500;

/**
 * A pasted character is one or two code points. Any longer and the query is
 * prose — searching its letters would bury the name matches under an alphabet.
 */
const PASTE_LIMIT = 2;

const HEX = /^[0-9a-f]{1,6}$/i;
const DECIMAL = /^[0-9]{1,7}$/;

const PREFIXED: ReadonlyArray<[RegExp, 16 | 10]> = [
  [/^u\+([0-9a-f]{1,6})$/i, 16],
  [/^0x([0-9a-f]{1,6})$/i, 16],
  [/^\\u\{([0-9a-f]{1,6})\}$/i, 16],
  [/^\\u([0-9a-f]{4})$/i, 16],
  [/^&#x([0-9a-f]{1,6});?$/i, 16],
  [/^&#([0-9]{1,7});?$/, 10],
];

const ENTITY = /^&?([a-zA-Z][a-zA-Z0-9]*);$/;

function parse(text: string, radix: 16 | 10): number | null {
  const value = Number.parseInt(text, radix);
  return isCodePoint(value) ? value : null;
}

/**
 * The code points a query names, before anything is filtered. Split out so
 * the parsing can be tested apart from the displayable rule.
 */
export function parseQuery(query: string): number[] {
  const text = query.trim();
  if (text === '') return [];
  const found: number[] = [];
  const add = (value: number | null) => {
    if (value !== null && !found.includes(value)) found.push(value);
  };

  for (const [pattern, radix] of PREFIXED) {
    const match = pattern.exec(text);
    if (match?.[1]) add(parse(match[1], radix));
  }

  const entity = ENTITY.exec(text);
  if (entity?.[1]) add(entityCodePoint(entity[1]));
  // A bare word may also be an entity name — `mdash` as readily as `&mdash;`.
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(text)) add(entityCodePoint(text));

  // A bare number is ambiguous. Hex first: `2014` is far more often a code
  // point than a decimal value, and both are offered anyway.
  if (HEX.test(text)) add(parse(text, 16));
  if (DECIMAL.test(text)) add(parse(text, 10));

  if (/[a-z]/i.test(text) && text.length >= 2) {
    for (const codePoint of searchNames(text)) add(codePoint);
  }

  const pasted = [...text];
  if (pasted.length <= PASTE_LIMIT) {
    for (const char of pasted) add(char.codePointAt(0) ?? null);
  }

  return found;
}

/** The characters a query finds: parsed, filtered to what can be drawn, capped. */
export function searchCharacters(query: string): number[] {
  return parseQuery(query).filter(isDisplayable).slice(0, RESULT_LIMIT);
}
