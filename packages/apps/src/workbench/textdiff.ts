/**
 * A line diff over the longest common subsequence.
 *
 * The common prefix and suffix are stripped before the table is built, which
 * is what makes a one-line change in a thousand-line file cheap. Past a cell
 * budget the exact table would cost more memory than the answer is worth, so
 * the middle is reported as one replacement and the result says it was capped
 * rather than pretending to a precision it does not have.
 *
 * Runs come out in a fixed order — removed before added inside a change block
 * — so a side-by-side view can pair them without guessing.
 */

export type DiffOp = 'equal' | 'added' | 'removed';

export interface DiffRun {
  op: DiffOp;
  lines: string[];
  /** 0-based line in the left text. For an added run, where it would go. */
  leftStart: number;
  /** 0-based line in the right text. For a removed run, where it would go. */
  rightStart: number;
}

export interface LineDiff {
  runs: DiffRun[];
  added: number;
  removed: number;
  /** The middle was too large to diff exactly and is reported as one replacement. */
  capped: boolean;
}

/**
 * Lines for diffing. A trailing newline ends the last line rather than
 * starting an empty one, and a CRLF file diffs against an LF one.
 */
export function splitLines(text: string): string[] {
  if (text === '') return [];
  const body = text.endsWith('\n') ? text.slice(0, -1) : text;
  return body.split('\n').map((line) => (line.endsWith('\r') ? line.slice(0, -1) : line));
}

/** Cells of the LCS table above which the middle is reported as one replacement. */
export const DEFAULT_MAX_CELLS = 1_500_000;

interface Step {
  op: DiffOp;
  line: string;
}

function lcsSteps(left: string[], right: string[]): Step[] {
  const n = left.length;
  const m = right.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        left[i] === right[j]
          ? (table[(i + 1) * width + j + 1] as number) + 1
          : Math.max(table[(i + 1) * width + j] as number, table[i * width + j + 1] as number);
    }
  }
  const steps: Step[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (left[i] === right[j]) {
      steps.push({ op: 'equal', line: left[i] as string });
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] as number) >= (table[i * width + j + 1] as number)) {
      steps.push({ op: 'removed', line: left[i] as string });
      i += 1;
    } else {
      steps.push({ op: 'added', line: right[j] as string });
      j += 1;
    }
  }
  while (i < n) {
    steps.push({ op: 'removed', line: left[i] as string });
    i += 1;
  }
  while (j < m) {
    steps.push({ op: 'added', line: right[j] as string });
    j += 1;
  }
  return steps;
}

/** Steps into runs, with removed before added inside each change block. */
function toRuns(steps: Step[]): DiffRun[] {
  const runs: DiffRun[] = [];
  let leftLine = 0;
  let rightLine = 0;
  let at = 0;
  while (at < steps.length) {
    const step = steps[at] as Step;
    if (step.op === 'equal') {
      const lines: string[] = [];
      const leftStart = leftLine;
      const rightStart = rightLine;
      while (at < steps.length && (steps[at] as Step).op === 'equal') {
        lines.push((steps[at] as Step).line);
        at += 1;
        leftLine += 1;
        rightLine += 1;
      }
      runs.push({ op: 'equal', lines, leftStart, rightStart });
      continue;
    }
    const removed: string[] = [];
    const added: string[] = [];
    const leftStart = leftLine;
    const rightStart = rightLine;
    while (at < steps.length && (steps[at] as Step).op !== 'equal') {
      const current = steps[at] as Step;
      if (current.op === 'removed') {
        removed.push(current.line);
        leftLine += 1;
      } else {
        added.push(current.line);
        rightLine += 1;
      }
      at += 1;
    }
    if (removed.length > 0) runs.push({ op: 'removed', lines: removed, leftStart, rightStart });
    if (added.length > 0) runs.push({ op: 'added', lines: added, leftStart: leftLine, rightStart });
  }
  return runs;
}

export interface DiffOptions {
  maxCells?: number;
}

/** Diff two texts by line. */
export function diffLines(left: string, right: string, options: DiffOptions = {}): LineDiff {
  const maxCells = options.maxCells ?? DEFAULT_MAX_CELLS;
  const a = splitLines(left);
  const b = splitLines(right);

  let head = 0;
  while (head < a.length && head < b.length && a[head] === b[head]) head += 1;
  let tail = 0;
  while (
    tail < a.length - head &&
    tail < b.length - head &&
    a[a.length - 1 - tail] === b[b.length - 1 - tail]
  )
    tail += 1;

  const midA = a.slice(head, a.length - tail);
  const midB = b.slice(head, b.length - tail);
  const capped = (midA.length + 1) * (midB.length + 1) > maxCells;

  const steps: Step[] = a.slice(0, head).map((line) => ({ op: 'equal' as const, line }));
  if (capped) {
    for (const line of midA) steps.push({ op: 'removed', line });
    for (const line of midB) steps.push({ op: 'added', line });
  } else {
    steps.push(...lcsSteps(midA, midB));
  }
  for (const line of a.slice(a.length - tail)) steps.push({ op: 'equal', line });

  const runs = toRuns(steps);
  let added = 0;
  let removed = 0;
  for (const run of runs) {
    if (run.op === 'added') added += run.lines.length;
    if (run.op === 'removed') removed += run.lines.length;
  }
  return { runs, added, removed, capped };
}

export interface DiffRow {
  op: DiffOp | 'changed';
  left: string | null;
  right: string | null;
  /** 1-based line numbers, for the gutter. */
  leftNumber: number | null;
  rightNumber: number | null;
}

/**
 * Runs as side-by-side rows. A removed run and the added run beside it are
 * paired line for line; whichever is longer keeps the extra rows to itself.
 */
export function alignRuns(runs: DiffRun[]): DiffRow[] {
  const rows: DiffRow[] = [];
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i] as DiffRun;
    if (run.op === 'equal') {
      run.lines.forEach((line, n) => {
        rows.push({
          op: 'equal',
          left: line,
          right: line,
          leftNumber: run.leftStart + n + 1,
          rightNumber: run.rightStart + n + 1,
        });
      });
      continue;
    }
    const next = runs[i + 1];
    if (run.op === 'removed' && next?.op === 'added') {
      const count = Math.max(run.lines.length, next.lines.length);
      for (let n = 0; n < count; n += 1) {
        const left = run.lines[n];
        const right = next.lines[n];
        rows.push({
          op: left !== undefined && right !== undefined ? 'changed' : left ? 'removed' : 'added',
          left: left ?? null,
          right: right ?? null,
          leftNumber: left === undefined ? null : run.leftStart + n + 1,
          rightNumber: right === undefined ? null : next.rightStart + n + 1,
        });
      }
      i += 1;
      continue;
    }
    run.lines.forEach((line, n) => {
      const isRemoved = run.op === 'removed';
      rows.push({
        op: run.op,
        left: isRemoved ? line : null,
        right: isRemoved ? null : line,
        leftNumber: isRemoved ? run.leftStart + n + 1 : null,
        rightNumber: isRemoved ? null : run.rightStart + n + 1,
      });
    });
  }
  return rows;
}

const PREFIX: Record<DiffOp, string> = { equal: '  ', added: '+ ', removed: '- ' };

/** The diff as text, for copying. */
export function toUnified(runs: DiffRun[]): string {
  const lines: string[] = [];
  for (const run of runs) for (const line of run.lines) lines.push(PREFIX[run.op] + line);
  return lines.join('\n');
}
