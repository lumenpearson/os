/**
 * The board: nine rows of nine real buttons, so pointer and keyboard run
 * through one code path. Tab reaches the board once, the arrows walk it, and
 * 1–9 writes wherever the cursor is — the same command the number pad sends.
 *
 * The heavier rules between the boxes are elements, not thicker borders: a
 * 2px border on some cells and 1px on others would make the cells different
 * sizes and the whole grid would drift. A one-pixel divider in a one-pixel
 * gap sits exactly where it belongs and costs the cells nothing.
 */

import { cx } from '@lumen/ui';
import { memo, type KeyboardEvent as ReactKeyboardEvent, useEffect, useRef } from 'react';
import { BOX, columnOf, DIGITS, indexAt, rowOf, SIZE } from './grid';
import { cellName } from './labels';
import { hasMark, isGiven, type PlayState } from './play';

interface CellProps {
  index: number;
  name: string;
  value: number;
  given: boolean;
  marks: number;
  size: number;
  /** The cell the keys act on. */
  cursor: boolean;
  /** Shares a row, column or box with the cursor. */
  peer: boolean;
  /** Holds the same digit as the cursor. */
  echo: boolean;
  /** The last Check disagreed with this entry. */
  wrong: boolean;
  /** This digit is repeated somewhere in one of its units. */
  conflict: boolean;
}

const Cell = memo(function Cell({
  index,
  name,
  value,
  given,
  marks,
  size,
  cursor,
  peer,
  echo,
  wrong,
  conflict,
}: CellProps) {
  return (
    <button
      type="button"
      role="gridcell"
      data-index={index}
      aria-label={name}
      aria-selected={cursor}
      tabIndex={cursor ? 0 : -1}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.56) }}
      className={cx(
        'mono relative flex shrink-0 items-center justify-center p-0 leading-none tabular-nums select-none lumen-focus',
        'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
        cursor ? 'bg-accent/20' : echo ? 'bg-accent/10' : peer ? 'bg-surface-2' : 'bg-surface',
        wrong && 'bg-danger/15',
        given ? 'font-medium text-ink' : 'text-accent',
        conflict && 'text-danger',
      )}
    >
      {value !== 0 && value}
      {value === 0 && marks !== 0 && (
        <span
          aria-hidden
          // deslop-ignore-next-line 28 — nine pencil marks sit three by three, as they do on paper
          className="grid size-full grid-cols-3 grid-rows-3 place-items-center text-ink-3"
          style={{ fontSize: Math.round(size * 0.26) }}
        >
          {DIGITS.map((digit) => (
            <span key={digit}>{hasMark(marks, digit) ? digit : ''}</span>
          ))}
        </span>
      )}
    </button>
  );
});

/** Read the cell an event landed on; the rules between them belong to nothing. */
function indexFrom(target: EventTarget | null): number | null {
  if (!(target instanceof HTMLElement)) return null;
  const value = target.closest<HTMLElement>('[data-index]')?.dataset.index;
  if (value === undefined) return null;
  const index = Number.parseInt(value, 10);
  return Number.isNaN(index) ? null : index;
}

export interface SudokuBoardProps {
  state: PlayState;
  cursor: number;
  /** The side of one cell in whole pixels. */
  cell: number;
  /** Shade the row, column and box the cursor is in. */
  highlight: boolean;
  conflicts: readonly number[];
  onCursor: (index: number) => void;
  onDigit: (index: number, digit: number) => void;
  onClear: (index: number) => void;
}

export function SudokuBoard({
  state,
  cursor,
  cell,
  highlight,
  conflicts,
  onCursor,
  onDigit,
  onClear,
}: SudokuBoardProps) {
  const grid = useRef<HTMLDivElement>(null);

  // Roving focus: the cursor cell is the only tab stop, and it takes focus
  // when the arrows move it — but only if the board already had focus.
  useEffect(() => {
    const root = grid.current;
    if (!root?.contains(document.activeElement)) return;
    root.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.focus({ preventScroll: false });
  }, [cursor]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Anything with a modifier belongs to the menubar — Mod+1 starts a new
    // easy puzzle, and must not write a 1 on the way past.
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const column = columnOf(cursor);
    const row = rowOf(cursor);
    const clamp = (value: number) => Math.max(0, Math.min(SIZE - 1, value));
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        next = indexAt(row, clamp(column - 1));
        break;
      case 'ArrowRight':
        next = indexAt(row, clamp(column + 1));
        break;
      case 'ArrowUp':
        next = indexAt(clamp(row - 1), column);
        break;
      case 'ArrowDown':
        next = indexAt(clamp(row + 1), column);
        break;
      case 'Home':
        next = indexAt(row, 0);
        break;
      case 'End':
        next = indexAt(row, SIZE - 1);
        break;
      case 'PageUp':
        next = indexAt(0, column);
        break;
      case 'PageDown':
        next = indexAt(SIZE - 1, column);
        break;
      case 'Backspace':
      case 'Delete':
      case '0':
        event.preventDefault();
        onClear(cursor);
        return;
      default:
        if (event.key >= '1' && event.key <= '9') {
          event.preventDefault();
          onDigit(cursor, Number(event.key));
        }
        return;
    }
    event.preventDefault();
    onCursor(next);
  };

  const conflicting = new Set(conflicts);
  const cursorValue = state.values[cursor] ?? 0;
  const cursorRow = rowOf(cursor);
  const cursorColumn = columnOf(cursor);

  const rows = [];
  for (let row = 0; row < SIZE; row += 1) {
    const cells = [];
    for (let column = 0; column < SIZE; column += 1) {
      const index = indexAt(row, column);
      const value = state.values[index] ?? 0;
      const sameBox =
        Math.floor(row / BOX) === Math.floor(cursorRow / BOX) &&
        Math.floor(column / BOX) === Math.floor(cursorColumn / BOX);
      cells.push(
        <Cell
          key={index}
          index={index}
          name={cellName(state, index)}
          value={value}
          given={isGiven(state, index)}
          marks={state.marks[index] ?? 0}
          size={cell}
          cursor={index === cursor}
          peer={
            highlight &&
            index !== cursor &&
            (row === cursorRow || column === cursorColumn || sameBox)
          }
          echo={index !== cursor && value !== 0 && value === cursorValue}
          wrong={state.wrong.includes(index)}
          conflict={conflicting.has(index)}
        />,
      );
      if (column === 2 || column === 5) {
        cells.push(
          <span
            key={`rule-${row}-${column}`}
            aria-hidden
            className="w-px self-stretch bg-rule-strong"
          />,
        );
      }
    }
    rows.push(
      // biome-ignore lint/a11y/useFocusableInteractive: a row in a grid is not a tab stop; its cells are
      <div key={row} role="row" className="flex gap-px">
        {cells}
      </div>,
    );
    if (row === 2 || row === 5) {
      rows.push(<span key={`rule-${row}`} aria-hidden className="h-px bg-rule-strong" />);
    }
  }

  return (
    <div
      ref={grid}
      role="grid"
      aria-label="Sudoku board, nine by nine"
      aria-rowcount={SIZE}
      aria-colcount={SIZE}
      className="flex flex-col gap-px overflow-hidden rounded-sm border border-rule-strong bg-rule"
      onKeyDown={onKeyDown}
      onClick={(event) => {
        const index = indexFrom(event.target);
        if (index !== null) onCursor(index);
      }}
      onFocus={(event) => {
        const index = indexFrom(event.target);
        if (index !== null) onCursor(index);
      }}
    >
      {rows}
    </div>
  );
}
