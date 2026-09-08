/**
 * The grid of characters.
 *
 * Only the rows the viewport covers are built — see grid.ts for why — and the
 * scroll position is read once a frame rather than on every scroll event. The
 * whole grid is one tab stop: the arrows move the cursor between cells, Enter
 * copies, and a printable key is handed to the search field, which is where
 * the person clearly meant it to go.
 */

import { cx, EmptyState, useElementSize } from '@lumen/ui';
import { SearchX } from 'lucide-react';
import {
  memo,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { displayText, formatCodePoint } from './chars';
import {
  CELL_SIZE,
  columnsFor,
  moveCursor,
  rowOf,
  rowsFor,
  scrollTopFor,
  visibleRows,
} from './grid';
import { characterName } from './names';

interface CellProps {
  codePoint: number;
  selected: boolean;
  column: number;
}

const Cell = memo(function Cell({ codePoint, selected, column }: CellProps) {
  const name = characterName(codePoint);
  return (
    <button
      type="button"
      // The cell is the control: one tab stop for the whole grid, the arrows
      // move between cells, and the label carries what the glyph cannot say.
      role="gridcell"
      aria-colindex={column + 1}
      aria-selected={selected}
      data-code-point={codePoint}
      tabIndex={selected ? 0 : -1}
      aria-label={
        name === null ? formatCodePoint(codePoint) : `${formatCodePoint(codePoint)} ${name}`
      }
      style={{ width: CELL_SIZE, height: CELL_SIZE }}
      className={cx(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-sm p-0 text-lg leading-none',
        'transition-colors duration-(--duration-fast) ease-(--ease-standard) lumen-focus',
        selected ? 'bg-selection text-ink' : 'text-ink hover:bg-surface-2',
      )}
    >
      {displayText(codePoint)}
    </button>
  );
});

export interface CharacterGridHandle {
  /** Put the keyboard on the cursor's cell. */
  focus: () => void;
}

export interface CharacterGridProps {
  codePoints: readonly number[];
  /** Index into `codePoints`; -1 when there is nothing to point at. */
  cursor: number;
  onCursor: (index: number) => void;
  onCopy: (codePoint: number) => void;
  /** A printable key pressed in the grid; the search field takes it. */
  onType: (text: string) => void;
  /** Names the grid for assistive technology: the block or list it is showing. */
  label: string;
  emptyTitle: string;
  emptyDescription: string;
  ref?: Ref<CharacterGridHandle>;
}

export function CharacterGrid({
  codePoints,
  cursor,
  onCursor,
  onCopy,
  onType,
  label,
  emptyTitle,
  emptyDescription,
  ref,
}: CharacterGridProps) {
  const [scroller, port] = useElementSize<HTMLDivElement>();
  const [scrollTop, setScrollTop] = useState(0);
  const frame = useRef(0);

  /**
   * The sidebar puts fifty-odd blocks between the search field and the grid,
   * so the grid has to be reachable without walking through them: Enter in
   * the search field calls this.
   */
  useImperativeHandle(
    ref,
    () => ({
      focus: () =>
        scroller.current?.querySelector<HTMLElement>('[data-code-point][tabindex="0"]')?.focus(),
    }),
    [scroller],
  );

  const columns = columnsFor(port.width);
  const rowCount = rowsFor(codePoints.length, columns);
  const cursorRow = cursor < 0 ? 0 : rowOf(cursor, columns);

  // Scrolling fires far faster than a frame, so the visible window is read
  // once per frame from the element itself.
  const onScroll = useCallback(() => {
    if (frame.current !== 0) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const el = scroller.current;
      if (el) setScrollTop(el.scrollTop);
    });
  }, [scroller]);

  useEffect(
    () => () => {
      if (frame.current !== 0) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const range = useMemo(() => {
    const window = visibleRows(scrollTop, port.height, rowCount);
    if (cursor < 0 || rowCount === 0) return window;
    // The cursor's row is always built, even after a jump the scroll position
    // has not caught up with: it has to exist before it can take focus.
    return {
      start: Math.min(window.start, cursorRow),
      end: Math.max(window.end, Math.min(rowCount, cursorRow + 1)),
    };
  }, [scrollTop, port.height, rowCount, cursor, cursorRow]);

  // Keep the cursor in view, and let it take focus if the grid already had it.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || cursor < 0) return;
    const next = scrollTopFor(cursorRow, el.scrollTop, el.clientHeight);
    if (next !== el.scrollTop) el.scrollTop = next;
    if (el.contains(document.activeElement)) {
      el.querySelector<HTMLElement>(`[data-code-point="${codePoints[cursor]}"]`)?.focus({
        preventScroll: true,
      });
    }
  }, [cursor, cursorRow, codePoints, scroller]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const rowsPerPage = Math.max(1, Math.floor(port.height / CELL_SIZE) - 1);
    const next = moveCursor(cursor, codePoints.length, columns, event.key, rowsPerPage);
    if (next !== null) {
      event.preventDefault();
      onCursor(next);
      return;
    }
    // Anything printable is a search, not a command. Space is left alone: the
    // cell is a button, and a button's space bar activates it.
    if (event.key.length === 1 && event.key !== ' ') {
      event.preventDefault();
      onType(event.key);
    }
  };

  const rows = [];
  for (let row = range.start; row < range.end; row += 1) {
    const cells = [];
    for (let column = 0; column < columns; column += 1) {
      const index = row * columns + column;
      const codePoint = codePoints[index];
      if (codePoint === undefined) break;
      cells.push(
        <Cell key={codePoint} codePoint={codePoint} column={column} selected={index === cursor} />,
      );
    }
    rows.push(
      // biome-ignore lint/a11y/useFocusableInteractive: a row in a grid is not a tab stop; the cells are
      <div
        key={row}
        role="row"
        aria-rowindex={row + 1}
        style={{ top: row * CELL_SIZE, height: CELL_SIZE }}
        className="absolute left-0 flex"
      >
        {cells}
      </div>,
    );
  }

  return (
    <div
      ref={scroller}
      onScroll={onScroll}
      onKeyDown={onKeyDown}
      onClick={(event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const value = target.closest<HTMLElement>('[data-code-point]')?.dataset.codePoint;
        if (value === undefined) return;
        const codePoint = Number.parseInt(value, 10);
        const index = codePoints.indexOf(codePoint);
        if (index < 0) return;
        onCursor(index);
        onCopy(codePoint);
      }}
      role="grid"
      aria-label={label}
      aria-rowcount={rowCount}
      aria-colcount={columns}
      className="lumen-scroll relative min-h-0 min-w-0 flex-1 bg-surface"
    >
      {codePoints.length === 0 ? (
        <EmptyState icon={<SearchX />} title={emptyTitle} description={emptyDescription} />
      ) : (
        <div className="relative w-full" style={{ height: rowCount * CELL_SIZE }}>
          {rows}
        </div>
      )}
    </div>
  );
}
