/**
 * What the grid is showing: a block, one of the two lists, or the results of
 * a search. Resolving that in one place keeps the grid, the title and the
 * status line from ever disagreeing about which of them it is.
 */

import { blockById, blockSize, DEFAULT_BLOCK, formatBlockRange, type UnicodeBlock } from './blocks';
import { displayableRange } from './chars';
import { searchCharacters } from './search';
import { type CharmapData, PINNED_SOURCE, RECENT_SOURCE, type SourceId } from './storage';

export const SEARCH_SOURCE = 'search';

export interface CharacterSource {
  id: SourceId | typeof SEARCH_SOURCE;
  /** What the sidebar, the select and the window title call it. */
  name: string;
  codePoints: readonly number[];
  /** The block behind the grid, when there is one. */
  block: UnicodeBlock | null;
}

export function resolveSource(data: CharmapData, query: string): CharacterSource {
  if (query.trim() !== '') {
    return {
      id: SEARCH_SOURCE,
      name: 'Search results',
      codePoints: searchCharacters(query),
      block: null,
    };
  }
  if (data.source === PINNED_SOURCE) {
    return { id: PINNED_SOURCE, name: 'Pinned', codePoints: data.pinned, block: null };
  }
  if (data.source === RECENT_SOURCE) {
    return { id: RECENT_SOURCE, name: 'Recent', codePoints: data.recents, block: null };
  }
  const block = blockById(data.source) ?? blockById(DEFAULT_BLOCK);
  if (!block) return { id: data.source, name: data.source, codePoints: [], block: null };
  return {
    id: block.id,
    name: block.name,
    codePoints: displayableRange(block.start, block.end),
    block,
  };
}

/**
 * The line under the grid. A block says how many of its code points are drawn
 * and how many it covers, because the difference — unassigned code points,
 * surrogates, controls — is the reason the grid is shorter than the range.
 */
export function statusLine(source: CharacterSource): string {
  const shown = source.codePoints.length;
  if (source.block) {
    const covered = blockSize(source.block);
    const range = formatBlockRange(source.block);
    return shown === covered
      ? `${range} · ${covered} characters`
      : `${range} · ${shown} of ${covered} code points have a character`;
  }
  if (source.id === SEARCH_SOURCE) {
    return shown === 0 ? 'No results' : `${shown} ${shown === 1 ? 'result' : 'results'}`;
  }
  if (source.id === PINNED_SOURCE) {
    return shown === 0 ? 'Nothing pinned' : `${shown} pinned`;
  }
  return shown === 0 ? 'Nothing copied yet' : `${shown} copied recently`;
}

export interface EmptyCopy {
  title: string;
  description: string;
}

/** What an empty grid says. Each case has its own reason for being empty. */
export function emptyStateFor(source: CharacterSource): EmptyCopy {
  if (source.id === SEARCH_SOURCE) {
    return {
      title: 'No character found',
      description: 'Search by code point — U+2014, 2014 or 8212 — or paste the character itself.',
    };
  }
  if (source.id === PINNED_SOURCE) {
    return {
      title: 'No pinned characters',
      description: 'Pin a character from the details to keep it here.',
    };
  }
  if (source.id === RECENT_SOURCE) {
    return {
      title: 'No recent characters',
      description: 'Characters you copy are kept here, newest first.',
    };
  }
  return {
    title: 'Nothing to show',
    description: 'This block has no code point with a character to draw.',
  };
}
