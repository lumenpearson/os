import { describe, expect, it } from 'vitest';
import { alignRuns, type DiffRun, diffLines, splitLines, toUnified } from './textdiff';

/** The runs must still spell out both original texts. */
const rebuild = (runs: DiffRun[]) => ({
  left: runs.filter((r) => r.op !== 'added').flatMap((r) => r.lines),
  right: runs.filter((r) => r.op !== 'removed').flatMap((r) => r.lines),
});

const shape = (runs: DiffRun[]) => runs.map((r) => `${r.op}:${r.lines.join('|')}`);

describe('splitLines', () => {
  it('treats an empty text as no lines', () => {
    expect(splitLines('')).toEqual([]);
  });

  it('ends the last line on a trailing newline rather than adding an empty one', () => {
    expect(splitLines('a\nb\n')).toEqual(['a', 'b']);
    expect(splitLines('a\nb')).toEqual(['a', 'b']);
  });

  it('keeps a deliberate blank line', () => {
    expect(splitLines('a\n\nb\n')).toEqual(['a', '', 'b']);
  });

  it('drops a carriage return so CRLF diffs against LF', () => {
    expect(splitLines('a\r\nb\r\n')).toEqual(['a', 'b']);
  });
});

describe('diffLines', () => {
  it('returns one equal run for identical input', () => {
    const diff = diffLines('a\nb\nc', 'a\nb\nc');
    expect(shape(diff.runs)).toEqual(['equal:a|b|c']);
    expect([diff.added, diff.removed, diff.capped]).toEqual([0, 0, false]);
  });

  it('returns nothing for two empty texts', () => {
    const diff = diffLines('', '');
    expect(diff.runs).toEqual([]);
    expect(diff.added + diff.removed).toBe(0);
  });

  it('finds an insertion in the middle', () => {
    const diff = diffLines('a\nc', 'a\nb\nc');
    expect(shape(diff.runs)).toEqual(['equal:a', 'added:b', 'equal:c']);
    expect([diff.added, diff.removed]).toEqual([1, 0]);
    expect(rebuild(diff.runs)).toEqual({ left: ['a', 'c'], right: ['a', 'b', 'c'] });
  });

  it('finds a deletion in the middle', () => {
    const diff = diffLines('a\nb\nc', 'a\nc');
    expect(shape(diff.runs)).toEqual(['equal:a', 'removed:b', 'equal:c']);
    expect([diff.added, diff.removed]).toEqual([0, 1]);
  });

  it('puts removed before added in a replacement', () => {
    const diff = diffLines('a\nX\nc', 'a\nY\nc');
    expect(shape(diff.runs)).toEqual(['equal:a', 'removed:X', 'added:Y', 'equal:c']);
  });

  it('keeps the lines that survive two separate deletions', () => {
    const diff = diffLines('1\n2\n3\n4\n5', '1\n3\n5');
    expect(shape(diff.runs)).toEqual(['equal:1', 'removed:2', 'equal:3', 'removed:4', 'equal:5']);
  });

  it('keeps the lines that survive two separate insertions', () => {
    const diff = diffLines('1\n3\n5', '1\n2\n3\n4\n5');
    expect(shape(diff.runs)).toEqual(['equal:1', 'added:2', 'equal:3', 'added:4', 'equal:5']);
  });

  it('finds a common line in the middle of a change', () => {
    const diff = diffLines('a\nb\nc\nd', 'a\nx\nc\ny');
    expect(shape(diff.runs)).toEqual([
      'equal:a',
      'removed:b',
      'added:x',
      'equal:c',
      'removed:d',
      'added:y',
    ]);
  });

  it('handles a moved block without losing a line', () => {
    const diff = diffLines('A\nB\nC\nD', 'C\nD\nA\nB');
    expect(rebuild(diff.runs)).toEqual({
      left: ['A', 'B', 'C', 'D'],
      right: ['C', 'D', 'A', 'B'],
    });
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(2);
  });

  it('reports every line added when the left side is empty', () => {
    const diff = diffLines('', 'a\nb');
    expect(shape(diff.runs)).toEqual(['added:a|b']);
    expect(diff.added).toBe(2);
  });

  it('reports every line removed when the right side is empty', () => {
    const diff = diffLines('a\nb', '');
    expect(shape(diff.runs)).toEqual(['removed:a|b']);
    expect(diff.removed).toBe(2);
  });

  it('numbers runs against their own side', () => {
    const diff = diffLines('a\nb\nc\nd', 'a\nc\nd\ne');
    expect(diff.runs.map((r) => [r.op, r.leftStart, r.rightStart])).toEqual([
      ['equal', 0, 0],
      ['removed', 1, 1],
      ['equal', 2, 1],
      ['added', 4, 3],
    ]);
  });

  it('sees through a long identical prefix and suffix', () => {
    const prefix = Array.from({ length: 300 }, (_, i) => `p${i}`).join('\n');
    const suffix = Array.from({ length: 300 }, (_, i) => `s${i}`).join('\n');
    const diff = diffLines(`${prefix}\nX\n${suffix}`, `${prefix}\nY\n${suffix}`);
    expect(shape(diff.runs)).toEqual([
      `equal:${Array.from({ length: 300 }, (_, i) => `p${i}`).join('|')}`,
      'removed:X',
      'added:Y',
      `equal:${Array.from({ length: 300 }, (_, i) => `s${i}`).join('|')}`,
    ]);
    expect(diff.capped).toBe(false);
  });

  it('reports one replacement rather than an exact diff past the cell budget', () => {
    const left = 'a\nb\nc\nd\ne';
    const right = 'v\nw\nx\ny\nz';
    const diff = diffLines(left, right, { maxCells: 4 });
    expect(diff.capped).toBe(true);
    expect(shape(diff.runs)).toEqual(['removed:a|b|c|d|e', 'added:v|w|x|y|z']);
    expect(rebuild(diff.runs)).toEqual({
      left: ['a', 'b', 'c', 'd', 'e'],
      right: ['v', 'w', 'x', 'y', 'z'],
    });
  });

  it('still trims the shared edges before deciding it is capped', () => {
    const diff = diffLines('same\na\nsame2', 'same\nb\nsame2', { maxCells: 4 });
    expect(diff.capped).toBe(false);
  });

  it('treats a blank line as a line', () => {
    const diff = diffLines('a\n\nb', 'a\nb');
    expect(shape(diff.runs)).toEqual(['equal:a', 'removed:', 'equal:b']);
  });
});

describe('alignRuns', () => {
  it('pairs a replacement line for line', () => {
    const rows = alignRuns(diffLines('a\nX\nY\nb', 'a\nP\nQ\nb').runs);
    expect(rows).toEqual([
      { op: 'equal', left: 'a', right: 'a', leftNumber: 1, rightNumber: 1 },
      { op: 'changed', left: 'X', right: 'P', leftNumber: 2, rightNumber: 2 },
      { op: 'changed', left: 'Y', right: 'Q', leftNumber: 3, rightNumber: 3 },
      { op: 'equal', left: 'b', right: 'b', leftNumber: 4, rightNumber: 4 },
    ]);
  });

  it('leaves the other side empty when the runs are different lengths', () => {
    const rows = alignRuns(diffLines('a\nX\nY', 'a\nP').runs);
    expect(rows.map((r) => [r.op, r.left, r.right])).toEqual([
      ['equal', 'a', 'a'],
      ['changed', 'X', 'P'],
      ['removed', 'Y', null],
    ]);
    expect(rows[2]?.rightNumber).toBeNull();
  });

  it('puts an insertion on the right only', () => {
    const rows = alignRuns(diffLines('a\nb', 'a\nnew\nb').runs);
    expect(rows.map((r) => [r.op, r.left, r.right, r.leftNumber, r.rightNumber])).toEqual([
      ['equal', 'a', 'a', 1, 1],
      ['added', null, 'new', null, 2],
      ['equal', 'b', 'b', 2, 3],
    ]);
  });

  it('returns nothing for no runs', () => {
    expect(alignRuns([])).toEqual([]);
  });
});

describe('toUnified', () => {
  it('prefixes each line with its operation', () => {
    expect(toUnified(diffLines('a\nX\nc', 'a\nY\nc').runs)).toBe('  a\n- X\n+ Y\n  c');
  });

  it('returns an empty string for no runs', () => {
    expect(toUnified([])).toBe('');
  });
});
