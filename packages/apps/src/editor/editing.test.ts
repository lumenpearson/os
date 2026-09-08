import { describe, expect, it } from 'vitest';
import {
  canRedo,
  canUndo,
  clampFontSize,
  createHistory,
  DEFAULT_FONT_SIZE,
  DEFAULT_PREFS,
  detectLineEnding,
  expandReplacement,
  findMatches,
  findQueryError,
  indentLines,
  indentOf,
  insertTab,
  isLargeText,
  LARGE_FILE_LIMIT,
  lineColumnAt,
  lineCount,
  lineHeightFor,
  lineIndexAt,
  lineStartAt,
  newlineWithIndent,
  nextMatchFrom,
  normalizePrefs,
  offsetForLine,
  outdentLines,
  parseGoToLine,
  recordSnapshot,
  redoHistory,
  replaceAllMatches,
  replaceMatch,
  replaceRange,
  scrollTopToReveal,
  stepMatch,
  undoHistory,
  wordCount,
} from './editing';

const literal = { caseSensitive: false, regex: false };
const sensitive = { caseSensitive: true, regex: false };
const expression = { caseSensitive: false, regex: true };

describe('caret arithmetic', () => {
  const text = 'const a = 1;\n  const b = 2;\n';

  it('reports one-based line and column', () => {
    expect(lineColumnAt(text, 0)).toEqual({ line: 1, column: 1 });
    expect(lineColumnAt(text, 5)).toEqual({ line: 1, column: 6 });
    expect(lineColumnAt(text, 13)).toEqual({ line: 2, column: 1 });
    expect(lineColumnAt(text, text.length)).toEqual({ line: 3, column: 1 });
  });

  it('clamps an offset outside the document', () => {
    expect(lineColumnAt(text, -4)).toEqual({ line: 1, column: 1 });
    expect(lineColumnAt(text, 9999)).toEqual({ line: 3, column: 1 });
  });

  it('counts lines including the empty last one', () => {
    expect(lineCount('')).toBe(1);
    expect(lineCount('a')).toBe(1);
    expect(lineCount('a\nb')).toBe(2);
    expect(lineCount(text)).toBe(3);
  });

  it('finds line starts and indexes', () => {
    expect(lineStartAt(text, 15)).toBe(13);
    expect(lineIndexAt(text, 15)).toBe(1);
    expect(offsetForLine(text, 2)).toBe(13);
    expect(offsetForLine(text, 99)).toBe(28);
    expect(offsetForLine(text, 0)).toBe(0);
  });

  it('counts words and characters the way the status bar does', () => {
    expect(wordCount('')).toBe(0);
    expect(wordCount('  ')).toBe(0);
    expect(wordCount('one two\tthree\nfour')).toBe(4);
    expect(wordCount('trailing space ')).toBe(2);
  });

  it('names the line ending in use', () => {
    expect(detectLineEnding('a\nb')).toBe('LF');
    expect(detectLineEnding('a\r\nb')).toBe('CRLF');
    expect(detectLineEnding('no breaks')).toBe('LF');
  });
});

describe('tab insertion', () => {
  it('inserts two spaces at the caret', () => {
    expect(insertTab('ab', { start: 1, end: 1 })).toEqual({
      text: 'a  b',
      selection: { start: 3, end: 3 },
    });
  });

  it('replaces a selection inside one line', () => {
    expect(insertTab('abcd', { start: 1, end: 3 })).toEqual({
      text: 'a  d',
      selection: { start: 3, end: 3 },
    });
  });

  it('indents every line of a multi-line selection and keeps it selected', () => {
    const result = insertTab('one\ntwo\nthree', { start: 1, end: 5 });
    expect(result.text).toBe('  one\n  two\nthree');
    expect(result.selection).toEqual({ start: 0, end: 11 });
  });

  it('indents from an inverted selection too', () => {
    expect(indentLines('one\ntwo', { start: 6, end: 1 }).text).toBe('  one\n  two');
  });

  it('outdents spaces and a single tab', () => {
    expect(outdentLines('    deep\n\tone\nflush', { start: 0, end: 18 }).text).toBe(
      '  deep\none\nflush',
    );
  });
});

describe('auto-indent', () => {
  it('repeats the indentation of the current line', () => {
    const text = '    const a = 1;';
    expect(newlineWithIndent(text, { start: text.length, end: text.length })).toEqual({
      text: '    const a = 1;\n    ',
      selection: { start: 21, end: 21 },
    });
  });

  it('uses tabs when the line is indented with tabs', () => {
    expect(newlineWithIndent('\t\tvalue', { start: 7, end: 7 }).text).toBe('\t\tvalue\n\t\t');
  });

  it('takes only the indentation before the caret', () => {
    expect(newlineWithIndent('    text', { start: 2, end: 2 }).text).toBe('  \n    text');
  });

  it('adds nothing after an unindented line', () => {
    expect(newlineWithIndent('flush', { start: 5, end: 5 }).text).toBe('flush\n');
  });

  it('replaces the selection before breaking the line', () => {
    expect(newlineWithIndent('  a-b', { start: 3, end: 4 }).text).toBe('  a\n  b');
  });

  it('reads indentation off a line', () => {
    expect(indentOf('   x')).toBe('   ');
    expect(indentOf('x')).toBe('');
    expect(indentOf('\t \tx')).toBe('\t \t');
  });
});

describe('replaceRange', () => {
  it('splices text and leaves the caret after it', () => {
    expect(replaceRange('hello world', { start: 6, end: 11 }, 'there')).toEqual({
      text: 'hello there',
      selection: { start: 11, end: 11 },
    });
  });
});

describe('find', () => {
  const text = 'Alpha alpha ALPHA beta';

  it('is case-insensitive by default', () => {
    expect(findMatches(text, 'alpha', literal)).toHaveLength(3);
  });

  it('honours the case-sensitive toggle', () => {
    const matches = findMatches(text, 'alpha', sensitive);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ start: 6, end: 11, text: 'alpha' });
  });

  it('treats the query literally unless the regex toggle is on', () => {
    expect(findMatches('a.c abc', 'a.c', literal)).toHaveLength(1);
    expect(findMatches('a.c abc', 'a.c', expression)).toHaveLength(2);
  });

  it('captures groups for a replacement', () => {
    const matches = findMatches('key=value', '(\\w+)=(\\w+)', expression);
    expect(matches[0]?.groups).toEqual(['key', 'value']);
  });

  it('returns nothing for an empty or broken query', () => {
    expect(findMatches(text, '', literal)).toEqual([]);
    expect(findMatches(text, '(unclosed', expression)).toEqual([]);
    expect(findQueryError('(unclosed', expression)).toBeTruthy();
    expect(findQueryError('(unclosed', literal)).toBeNull();
  });

  it('does not loop on a zero-width match', () => {
    expect(findMatches('ab', 'x*', expression).length).toBeLessThanOrEqual(3);
  });

  it('stops at the match limit', () => {
    expect(findMatches('aaaa', 'a', literal, 2)).toHaveLength(2);
  });

  it('picks the next match after the caret and wraps', () => {
    const matches = findMatches(text, 'alpha', literal);
    expect(nextMatchFrom(matches, 0, true)).toBe(0);
    expect(nextMatchFrom(matches, 1, true)).toBe(1);
    expect(nextMatchFrom(matches, 20, true)).toBe(0);
    expect(nextMatchFrom(matches, 20, false)).toBe(2);
    expect(nextMatchFrom(matches, 0, false)).toBe(2);
    expect(nextMatchFrom([], 0, true)).toBe(-1);
  });

  it('steps through matches in both directions', () => {
    expect(stepMatch(3, 0, true)).toBe(1);
    expect(stepMatch(3, 2, true)).toBe(0);
    expect(stepMatch(3, 0, false)).toBe(2);
    expect(stepMatch(3, -1, false)).toBe(2);
    expect(stepMatch(0, 0, true)).toBe(-1);
  });
});

describe('replace', () => {
  it('replaces one match and puts the caret after it', () => {
    const matches = findMatches('one two one', 'one', literal);
    const match = matches[1];
    if (!match) throw new Error('expected a match');
    expect(replaceMatch('one two one', match, '1', literal)).toEqual({
      text: 'one two 1',
      selection: { start: 9, end: 9 },
    });
  });

  it('replaces every match and counts them', () => {
    expect(replaceAllMatches('a-a-a', 'a', 'b', literal)).toEqual({ text: 'b-b-b', count: 3 });
    expect(replaceAllMatches('nothing', 'z', 'b', literal)).toEqual({ text: 'nothing', count: 0 });
  });

  it('keeps a dollar sign literal outside regex mode', () => {
    expect(replaceAllMatches('cost', 'cost', '$1', literal).text).toBe('$1');
  });

  it('expands groups, the whole match and an escaped dollar in regex mode', () => {
    const match = findMatches('key=value', '(\\w+)=(\\w+)', expression)[0];
    if (!match) throw new Error('expected a match');
    expect(expandReplacement('$2=$1', match, expression)).toBe('value=key');
    expect(expandReplacement('[$&]', match, expression)).toBe('[key=value]');
    expect(expandReplacement('$$5', match, expression)).toBe('$5');
    expect(expandReplacement('$9', match, expression)).toBe('');
  });

  it('rewrites every line with an anchored expression', () => {
    expect(replaceAllMatches('a\nb', '^', '> ', expression).text).toBe('> a\n> b');
  });
});

describe('history', () => {
  const snapshot = (text: string) => ({
    text,
    selection: { start: text.length, end: text.length },
  });

  it('starts with nothing to undo', () => {
    const history = createHistory(snapshot(''));
    expect(canUndo(history)).toBe(false);
    expect(canRedo(history)).toBe(false);
    expect(undoHistory(history).snapshot).toBeNull();
  });

  it('folds one typing burst into a single step', () => {
    let history = createHistory(snapshot(''));
    history = recordSnapshot(history, snapshot('h'), 0);
    history = recordSnapshot(history, snapshot('he'), 100);
    history = recordSnapshot(history, snapshot('hel'), 200);
    expect(history.entries).toHaveLength(2);
    expect(undoHistory(history).snapshot?.text).toBe('');
  });

  it('breaks the step after a pause', () => {
    let history = createHistory(snapshot(''));
    history = recordSnapshot(history, snapshot('one'), 0);
    history = recordSnapshot(history, snapshot('one two'), 900);
    expect(history.entries).toHaveLength(3);
    const undone = undoHistory(history);
    expect(undone.snapshot?.text).toBe('one');
    expect(undoHistory(undone.history).snapshot?.text).toBe('');
  });

  it('records nothing when only the selection moved', () => {
    let history = createHistory(snapshot('abc'));
    history = recordSnapshot(history, { text: 'abc', selection: { start: 0, end: 3 } }, 5000);
    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]?.selection).toEqual({ start: 0, end: 3 });
  });

  it('redoes what was undone and drops the future after a new edit', () => {
    let history = createHistory(snapshot(''));
    history = recordSnapshot(history, snapshot('a'), 0);
    history = recordSnapshot(history, snapshot('ab'), 1000);
    const undone = undoHistory(history);
    expect(canRedo(undone.history)).toBe(true);
    expect(redoHistory(undone.history).snapshot?.text).toBe('ab');
    const diverged = recordSnapshot(undone.history, snapshot('ac'), 2000);
    expect(canRedo(diverged)).toBe(false);
    expect(diverged.entries.map((e) => e.text)).toEqual(['', 'a', 'ac']);
  });

  it('drops the oldest entries past the limit', () => {
    let history = createHistory(snapshot('0'));
    for (let i = 1; i <= 6; i++)
      history = recordSnapshot(history, snapshot(String(i)), i * 1000, { limit: 4 });
    expect(history.entries).toHaveLength(4);
    expect(history.index).toBe(3);
    expect(history.entries.map((e) => e.text)).toEqual(['3', '4', '5', '6']);
  });
});

describe('view helpers', () => {
  it('parses a go-to-line answer', () => {
    expect(parseGoToLine('12', 100)).toEqual({ line: 12, column: 1 });
    expect(parseGoToLine(' 4 : 7 ', 100)).toEqual({ line: 4, column: 7 });
    expect(parseGoToLine('999', 20)).toEqual({ line: 20, column: 1 });
    expect(parseGoToLine('0', 20)).toBeNull();
    expect(parseGoToLine('end', 20)).toBeNull();
    expect(parseGoToLine('', 20)).toBeNull();
  });

  it('scrolls the smallest distance that reveals a line', () => {
    expect(scrollTopToReveal(100, 20, 200, 0)).toBe(0);
    expect(scrollTopToReveal(400, 20, 200, 0)).toBe(220);
    expect(scrollTopToReveal(40, 20, 200, 100)).toBe(40);
    expect(scrollTopToReveal(0, 20, 200, 0)).toBe(0);
  });

  it('clamps the font size and derives a line height', () => {
    expect(clampFontSize(13)).toBe(13);
    expect(clampFontSize(2)).toBe(10);
    expect(clampFontSize(99)).toBe(24);
    expect(clampFontSize(Number.NaN)).toBe(DEFAULT_FONT_SIZE);
    expect(lineHeightFor(13)).toBe(21);
  });

  it('repairs preferences read from disk', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs({ fontSize: 'big', wordWrap: 1 })).toEqual(DEFAULT_PREFS);
    expect(normalizePrefs({ fontSize: 18, wordWrap: true, lineNumbers: false })).toEqual({
      fontSize: 18,
      wordWrap: true,
      lineNumbers: false,
    });
  });

  it('marks documents past the editing limit', () => {
    expect(isLargeText('short')).toBe(false);
    expect(isLargeText('x'.repeat(LARGE_FILE_LIMIT + 1))).toBe(true);
  });
});
