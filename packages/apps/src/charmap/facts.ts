/**
 * The rows of the detail pane: everything that can be said about a character,
 * in the order it is useful. Each row carries the exact text that goes on the
 * clipboard, so what is on screen and what is copied cannot drift apart.
 *
 * The named HTML entity appears only when `entities.ts` names the character.
 * There is no row for anything this app would have to guess at.
 */

import {
  cssEscape,
  formatBytes,
  formatCodePoint,
  formatUnits,
  htmlNumeric,
  jsEscape,
  utf8Bytes,
  utf16Units,
} from './chars';
import { namedEntity } from './entities';

export interface CharacterFact {
  id: string;
  label: string;
  value: string;
}

export function characterFacts(codePoint: number): CharacterFact[] {
  const facts: CharacterFact[] = [
    { id: 'code-point', label: 'Code point', value: formatCodePoint(codePoint) },
    { id: 'decimal', label: 'Decimal', value: String(codePoint) },
    { id: 'utf-8', label: 'UTF-8', value: formatBytes(utf8Bytes(codePoint)) },
    { id: 'utf-16', label: 'UTF-16', value: formatUnits(utf16Units(codePoint)) },
    { id: 'html', label: 'HTML', value: htmlNumeric(codePoint) },
  ];
  const named = namedEntity(codePoint);
  if (named !== null) facts.push({ id: 'html-named', label: 'HTML named', value: named });
  facts.push({ id: 'javascript', label: 'JavaScript', value: jsEscape(codePoint) });
  facts.push({ id: 'css', label: 'CSS', value: cssEscape(codePoint) });
  return facts;
}
