/**
 * Finding a unit by typing at it. A category can hold nineteen units, and a
 * nineteen-item select is a scroll hunt, so the picker is a text field that
 * ranks what it finds: the symbol first, then the name, then the alternative
 * spellings, exact before prefix before anywhere-inside.
 *
 * Queries are folded to bare letters and digits, so `ft2` finds `ft²`, `m/s`
 * and `ms` both find metres per second, `micron` finds the micrometre, and
 * neither accents nor spacing get in the way.
 */

import type { Unit } from './catalogue';

const SUPERSCRIPTS: Record<string, string> = {
  '²': '2',
  '³': '3',
  '⁰': '0',
  '¹': '1',
  '⁴': '4',
  '⁵': '5',
  '⁶': '6',
  '⁷': '7',
  '⁸': '8',
  '⁹': '9',
};

/** Lower case, no accents, no punctuation: what both sides of a match compare as. */
export function fold(text: string): string {
  return text
    .replace(/[\u00b2\u00b3\u00b9\u2070\u2074-\u2079]/g, (c) => SUPERSCRIPTS[c] ?? c)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\u00b5\u03bc]/g, 'u')
    .replace(/[^a-z0-9]/g, '');
}

/** Words of a name, folded, for matching a query against the start of any of them. */
function words(name: string): string[] {
  return name
    .split(/[\s\-·/]+/)
    .map(fold)
    .filter((word) => word !== '');
}

/**
 * How well a unit answers to `query`. Lower is better; `null` means it does
 * not answer at all.
 *
 * The first test is on the symbol exactly as written, case included, because
 * the SI prefixes turn on case: mW and MW are a thousandfold apart, and a
 * search that folded them together would offer the milliwatt to someone who
 * typed MW. Everything after that is folded.
 */
export function rankUnit(unit: Unit, query: string): number | null {
  const trimmed = query.trim();
  if (trimmed === '') return 0;
  if (unit.symbol === trimmed) return 0;
  const needle = fold(query);
  // A query of punctuation alone — "°", "/" — folds away to nothing. Only the
  // exact symbol above can answer it; matching everything would be noise.
  if (needle === '') return null;
  const symbol = fold(unit.symbol);
  const name = fold(unit.name);
  const aliases = (unit.aliases ?? []).map(fold);

  if (symbol === needle) return 1;
  if (name === needle) return 2;
  if (aliases.includes(needle)) return 3;
  if (symbol.startsWith(needle)) return 4;
  if (name.startsWith(needle)) return 5;
  if (words(unit.name).some((word) => word.startsWith(needle))) return 6;
  if (aliases.some((alias) => alias.startsWith(needle))) return 7;
  if (name.includes(needle)) return 8;
  if (symbol.includes(needle) || aliases.some((alias) => alias.includes(needle))) return 9;
  return null;
}

export interface UnitMatch {
  unit: Unit;
  rank: number;
}

/**
 * The matches for `query`, best first. Ties keep catalogue order, which runs
 * small to large, so `m` offers the metre before the mile. An empty query is
 * the whole list — the picker opens showing everything it has.
 */
export function searchUnits(units: readonly Unit[], query: string, limit = 60): Unit[] {
  if (query.trim() === '') return units.slice(0, limit);
  const matches: Array<UnitMatch & { index: number }> = [];
  units.forEach((unit, index) => {
    const rank = rankUnit(unit, query);
    if (rank !== null) matches.push({ unit, rank, index });
  });
  matches.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return matches.slice(0, limit).map((match) => match.unit);
}
