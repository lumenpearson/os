import { afterEach, describe, expect, it } from 'vitest';
import {
  buildTextIndex,
  findMatches,
  highlightNames,
  rangeForMatch,
  showMatches,
  stepMatch,
  supportsHighlights,
} from './find';

function page(html: string): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('findMatches', () => {
  it('finds every occurrence in document order', () => {
    expect(findMatches('The cat sat on the cat', 'cat')).toEqual([
      { start: 4, end: 7 },
      { start: 19, end: 22 },
    ]);
  });

  it('ignores case by default', () => {
    expect(findMatches('Cat cat', 'cat')).toHaveLength(2);
    expect(findMatches('Cat cat', 'cat', true)).toEqual([{ start: 4, end: 7 }]);
  });

  it('does not overlap matches', () => {
    expect(findMatches('aaaa', 'aa')).toEqual([
      { start: 0, end: 2 },
      { start: 2, end: 4 },
    ]);
  });

  it('finds nothing for an empty query', () => {
    expect(findMatches('anything', '')).toEqual([]);
  });
});

describe('stepMatch', () => {
  it('wraps at both ends', () => {
    expect(stepMatch(0, 3, 1)).toBe(1);
    expect(stepMatch(2, 3, 1)).toBe(0);
    expect(stepMatch(0, 3, -1)).toBe(2);
  });

  it('stays at zero without matches', () => {
    expect(stepMatch(0, 0, 1)).toBe(0);
  });
});

describe('buildTextIndex', () => {
  it('reads the page as one string', () => {
    const root = page('<p>Hello <b>world</b></p><p>again</p>');
    expect(buildTextIndex(root).text).toBe('Hello worldagain');
  });

  it('maps an offset back onto a range', () => {
    const root = page('<p>Hello <b>world</b></p>');
    const index = buildTextIndex(root);
    const [match] = findMatches(index.text, 'world');
    if (match === undefined) throw new Error('no match');
    const range = rangeForMatch(index, match);
    expect(range?.toString()).toBe('world');
  });

  it('maps a match that spans two text nodes', () => {
    const root = page('<p>He<b>llo</b></p>');
    const index = buildTextIndex(root);
    const [match] = findMatches(index.text, 'ell');
    if (match === undefined) throw new Error('no match');
    expect(rangeForMatch(index, match)?.toString()).toBe('ell');
  });
});

describe('highlights', () => {
  it('names one pair of highlights per window', () => {
    expect(highlightNames('w1a2')).toEqual({
      all: 'lumen-writer-match-w1a2',
      current: 'lumen-writer-current-w1a2',
    });
  });

  it('keeps the names usable as CSS identifiers', () => {
    expect(highlightNames('w 1/2').all).toBe('lumen-writer-match-w12');
    expect(highlightNames('').all).toBe('lumen-writer-match-window');
  });

  it('paints only where the highlight API exists', () => {
    expect(showMatches(highlightNames('w1'), [], null)).toBe(supportsHighlights());
  });
});
