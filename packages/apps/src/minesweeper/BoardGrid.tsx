import { cx } from '@lumen/ui';
import { Bomb, Flag, FlagOff } from 'lucide-react';
import {
  memo,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
} from 'react';
import { columnOf, indexAt, rowOf } from './board';
import { cellName, numberClass } from './labels';
import { type CellView, cellView, type GameState } from './reveal';

interface CellProps {
  index: number;
  name: string;
  kind: CellView['kind'];
  count: number;
  /** A mine that went off, or a flag that turned out to be wrong. */
  bad: boolean;
  size: number;
  focusable: boolean;
}

const Cell = memo(function Cell({ index, name, kind, count, bad, size, focusable }: CellProps) {
  const glyph = Math.round(size * 0.55);
  const digit = Math.round(size * 0.62);
  const open = kind === 'empty' || kind === 'count' || kind === 'mine';
  return (
    <button
      type="button"
      // A gridcell that is also the control: one tab stop for the whole
      // field, the arrows move between cells, the name carries the state.
      role="gridcell"
      data-index={index}
      aria-label={name}
      tabIndex={focusable ? 0 : -1}
      style={{ width: size, height: size, fontSize: digit }}
      className={cx(
        'mono tabular-nums flex shrink-0 items-center justify-center p-0 leading-none select-none lumen-focus',
        'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
        open ? 'bg-surface' : 'bg-surface-2 hover:bg-surface-3',
        bad && 'bg-danger/15',
        kind === 'count' && numberClass(count),
      )}
    >
      {kind === 'count' && count}
      {kind === 'question' && <span className="text-ink-3">?</span>}
      {kind === 'flag' &&
        (bad ? (
          <FlagOff width={glyph} height={glyph} className="text-danger" />
        ) : (
          <Flag width={glyph} height={glyph} className="text-accent" />
        ))}
      {kind === 'mine' && (
        <Bomb width={glyph} height={glyph} className={bad ? 'text-danger' : 'text-ink-2'} />
      )}
    </button>
  );
});

/** Read the cell an event landed on. Clicks on the hairlines belong to nothing. */
function indexFrom(target: EventTarget | null): number | null {
  if (!(target instanceof HTMLElement)) return null;
  const value = target.closest<HTMLElement>('[data-index]')?.dataset.index;
  if (value === undefined) return null;
  const index = Number.parseInt(value, 10);
  return Number.isNaN(index) ? null : index;
}

export interface BoardProps {
  state: GameState;
  /** The cell the arrows move and the keys act on. */
  cursor: number;
  cellSize: number;
  onCursor: (index: number) => void;
  onActivate: (index: number) => void;
  onFlag: (index: number) => void;
}

export function Board({ state, cursor, cellSize, onCursor, onActivate, onFlag }: BoardProps) {
  const grid = useRef<HTMLDivElement>(null);
  const { width, height } = state.config;

  // Roving focus: the cursor cell is the only tab stop, and it takes focus
  // when the arrows move it — but only if the field already had focus.
  useEffect(() => {
    const root = grid.current;
    if (!root?.contains(document.activeElement)) return;
    root.querySelector<HTMLElement>(`[data-index="${cursor}"]`)?.focus({ preventScroll: false });
  }, [cursor]);

  const act = (target: EventTarget | null, run: (index: number) => void) => {
    const index = indexFrom(target);
    if (index === null) return;
    onCursor(index);
    run(index);
  };

  const onClick = (event: ReactMouseEvent<HTMLDivElement>) => act(event.target, onActivate);

  /** However focus arrived — Tab, a click, a screen reader — the cursor follows. */
  const onFocus = (event: ReactFocusEvent<HTMLDivElement>) => {
    const index = indexFrom(event.target);
    if (index !== null) onCursor(index);
  };

  const onContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    act(event.target, onFlag);
  };

  /** Middle click is the mouse way to chord, as it has always been. */
  const onAuxClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 1) return;
    event.preventDefault();
    act(event.target, onActivate);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const x = columnOf(width, cursor);
    const y = rowOf(width, cursor);
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        next = indexAt(width, Math.max(0, x - 1), y);
        break;
      case 'ArrowRight':
        next = indexAt(width, Math.min(width - 1, x + 1), y);
        break;
      case 'ArrowUp':
        next = indexAt(width, x, Math.max(0, y - 1));
        break;
      case 'ArrowDown':
        next = indexAt(width, x, Math.min(height - 1, y + 1));
        break;
      case 'Home':
        next = event.ctrlKey ? 0 : indexAt(width, 0, y);
        break;
      case 'End':
        next = event.ctrlKey ? width * height - 1 : indexAt(width, width - 1, y);
        break;
      case 'PageUp':
        next = indexAt(width, x, 0);
        break;
      case 'PageDown':
        next = indexAt(width, x, height - 1);
        break;
      case 'f':
      case 'F':
        event.preventDefault();
        onFlag(cursor);
        return;
      case 'Enter':
        // Plain Enter is left to the button, which turns it into a click.
        if (!event.shiftKey) return;
        event.preventDefault();
        onFlag(cursor);
        return;
      default:
        return;
    }
    event.preventDefault();
    onCursor(next);
  };

  const rows = [];
  for (let y = 0; y < height; y += 1) {
    const cells = [];
    for (let x = 0; x < width; x += 1) {
      const index = indexAt(width, x, y);
      const view = cellView(state, index);
      cells.push(
        <Cell
          key={index}
          index={index}
          name={cellName(state, index)}
          kind={view.kind}
          count={view.kind === 'count' ? view.count : 0}
          bad={(view.kind === 'mine' && view.exploded) || (view.kind === 'flag' && view.wrong)}
          size={cellSize}
          focusable={index === cursor}
        />,
      );
    }
    rows.push(
      // biome-ignore lint/a11y/useFocusableInteractive: a row in a grid is not a tab stop; the cells are
      <div key={y} role="row" className="flex gap-px">
        {cells}
      </div>,
    );
  }

  return (
    <div
      ref={grid}
      role="grid"
      aria-label={`Minefield, ${height} rows by ${width} columns`}
      aria-rowcount={height}
      aria-colcount={width}
      className="flex flex-col gap-px overflow-hidden rounded-sm border border-rule-strong bg-rule"
      onClick={onClick}
      onFocus={onFocus}
      onContextMenu={onContextMenu}
      onAuxClick={onAuxClick}
      onKeyDown={onKeyDown}
    >
      {rows}
    </div>
  );
}
