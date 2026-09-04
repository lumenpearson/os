import { cx } from '@lumen/ui';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Evaluated } from './engine/evaluate';
import { defaultAlign, formatValue } from './engine/format';
import {
  type Coord,
  colToLetters,
  coordKey,
  inRange,
  normalizeRange,
  type RangeRef,
  rangeOf,
} from './engine/refs';
import { isError } from './engine/values';
import { indexAt, offsets, visibleWindow } from './geometry';
import {
  columnWidth,
  DEFAULT_COL_WIDTH,
  DEFAULT_ROW_HEIGHT,
  MIN_COL_WIDTH,
  rowHeight,
  type SheetData,
  styleAt,
} from './workbook';

const HEADER_H = 24;
const HEADER_W = 46;
const OVERSCAN = 3;

export interface Selection {
  /** Where the selection started; the cell the toolbar and formula bar act on. */
  anchor: Coord;
  focus: Coord;
}

export interface EditorState {
  cell: Coord;
  text: string;
  /** Caret position, kept so a clicked reference lands in the right place. */
  caret: number;
  /** Where the edit started: in the cell, or in the formula bar. */
  source: 'grid' | 'bar';
}

export interface GridProps {
  sheet: SheetData;
  values: Evaluated;
  selection: Selection;
  onSelectionChange: (selection: Selection) => void;
  editor: EditorState | null;
  onEditorChange: (editor: EditorState | null) => void;
  /** Enter, Tab or a click elsewhere: write the text and move on. */
  onCommit: (cell: Coord, text: string, move: 'down' | 'right' | 'up' | 'left' | 'none') => void;
  onFill: (source: RangeRef, target: RangeRef) => void;
  onColumnResize: (col: number, width: number) => void;
  onRowResize: (row: number, height: number) => void;
  /** A click on a cell while a formula is open inserts its reference. */
  onReferencePick: (range: RangeRef) => boolean;
  /** How many rows and columns to draw; the view grows it as the selection travels. */
  size: { rows: number; cols: number };
  locale: string;
  currency: string;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

/**
 * The sheet grid. Only the visible cells are in the DOM; headers are offset
 * against the scroll position through refs so scrolling never re-renders more
 * than the cell window, and drags (resize, fill, range) write to the DOM
 * inside requestAnimationFrame.
 */
export function Grid({
  sheet,
  values,
  selection,
  onSelectionChange,
  editor,
  onEditorChange,
  onCommit,
  onFill,
  onColumnResize,
  onRowResize,
  onReferencePick,
  size,
  locale,
  currency,
  containerRef,
}: GridProps) {
  const gridId = useId();
  const scroller = useRef<HTMLDivElement>(null);
  const colHeader = useRef<HTMLDivElement>(null);
  const rowHeader = useRef<HTMLDivElement>(null);
  const editorInput = useRef<HTMLInputElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [scroll, setScroll] = useState({ left: 0, top: 0 });
  const dragging = useRef<'cells' | 'fill' | 'pick' | null>(null);
  /** Where a formula reference drag started. */
  const pickAnchor = useRef<Coord | null>(null);

  const colOffsets = useMemo(
    () => offsets(size.cols, (i) => columnWidth(sheet, i)),
    [size.cols, sheet],
  );
  const rowOffsets = useMemo(
    () => offsets(size.rows, (i) => rowHeight(sheet, i)),
    [size.rows, sheet],
  );
  const totalWidth = colOffsets[size.cols] ?? 0;
  const totalHeight = rowOffsets[size.rows] ?? 0;

  const range = useMemo(
    () => normalizeRange(rangeOf(selection.anchor, selection.focus)),
    [selection],
  );

  const window = visibleWindow(colOffsets, rowOffsets, size, scroll, viewport, OVERSCAN);

  // Measure the viewport; the cell window follows from it.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setViewport((v) =>
        v.width === el.clientWidth && v.height === el.clientHeight
          ? v
          : { width: el.clientWidth, height: el.clientHeight },
      );
    });
    observer.observe(el);
    setViewport({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  const frame = useRef(0);
  const onScroll = useCallback(() => {
    const el = scroller.current;
    if (!el || frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const left = el.scrollLeft;
      const top = el.scrollTop;
      if (colHeader.current) colHeader.current.style.transform = `translateX(${-left}px)`;
      if (rowHeader.current) rowHeader.current.style.transform = `translateY(${-top}px)`;
      setScroll((s) => (s.left === left && s.top === top ? s : { left, top }));
    });
  }, []);

  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  /** Keep the focused cell inside the viewport after a keyboard move. */
  useEffect(() => {
    const el = scroller.current;
    if (!el || dragging.current) return;
    const { col, row } = selection.focus;
    const left = colOffsets[col] ?? 0;
    const right = colOffsets[col + 1] ?? left;
    const top = rowOffsets[row] ?? 0;
    const bottom = rowOffsets[row + 1] ?? top;
    let nextLeft = el.scrollLeft;
    let nextTop = el.scrollTop;
    if (left < nextLeft) nextLeft = left;
    else if (right > nextLeft + el.clientWidth) nextLeft = right - el.clientWidth;
    if (top < nextTop) nextTop = top;
    else if (bottom > nextTop + el.clientHeight) nextTop = bottom - el.clientHeight;
    if (nextLeft !== el.scrollLeft || nextTop !== el.scrollTop)
      el.scrollTo({ left: nextLeft, top: nextTop });
  }, [selection.focus, colOffsets, rowOffsets]);

  useEffect(() => {
    if (editor?.source !== 'grid') return;
    const input = editorInput.current;
    if (!input || document.activeElement === input) return;
    input.focus({ preventScroll: true });
    input.setSelectionRange(editor.caret, editor.caret);
  }, [editor]);

  const cellAt = useCallback(
    (clientX: number, clientY: number): Coord => {
      const el = scroller.current;
      if (!el) return { col: 0, row: 0 };
      const box = el.getBoundingClientRect();
      const x = clientX - box.left + el.scrollLeft;
      const y = clientY - box.top + el.scrollTop;
      return {
        col: indexAt(colOffsets, Math.max(0, x), size.cols),
        row: indexAt(rowOffsets, Math.max(0, y), size.rows),
      };
    },
    [colOffsets, rowOffsets, size.cols, size.rows],
  );

  // ── pointer: select a cell or drag a range ──────────────────────────────

  const onCellPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const cell = cellAt(e.clientX, e.clientY);
    if (editor && onReferencePick(rangeOf(cell, cell))) {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      dragging.current = 'pick';
      pickAnchor.current = cell;
      return;
    }
    if (editor) onCommit(editor.cell, editor.text, 'none');
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragging.current = 'cells';
    const anchor = e.shiftKey ? selection.anchor : cell;
    onSelectionChange({ anchor, focus: cell });
    scroller.current?.focus({ preventScroll: true });
  };

  const onCellPointerMove = (e: React.PointerEvent) => {
    if (dragging.current === 'pick') {
      const from = pickAnchor.current;
      if (from) onReferencePick(rangeOf(from, cellAt(e.clientX, e.clientY)));
      return;
    }
    if (dragging.current !== 'cells') return;
    const cell = cellAt(e.clientX, e.clientY);
    if (cell.col !== selection.focus.col || cell.row !== selection.focus.row) {
      onSelectionChange({ anchor: selection.anchor, focus: cell });
    }
  };

  const endDrag = (e: React.PointerEvent) => {
    if (dragging.current === 'cells' || dragging.current === 'pick') {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
      dragging.current = null;
      pickAnchor.current = null;
    }
  };

  // ── pointer: the fill handle ────────────────────────────────────────────

  const fillPreview = useRef<HTMLDivElement>(null);
  const onFillPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    dragging.current = 'fill';
    let target = range;
    let raf = 0;
    const draw = () => {
      raf = 0;
      const el = fillPreview.current;
      if (!el) return;
      const left = colOffsets[target.start.col] ?? 0;
      const top = rowOffsets[target.start.row] ?? 0;
      el.style.display = 'block';
      el.style.transform = `translate(${left}px, ${top}px)`;
      el.style.width = `${(colOffsets[target.end.col + 1] ?? 0) - left}px`;
      el.style.height = `${(rowOffsets[target.end.row + 1] ?? 0) - top}px`;
    };
    const onMove = (ev: PointerEvent) => {
      const cell = cellAt(ev.clientX, ev.clientY);
      // Fill in one direction only: whichever the pointer left the block by.
      const dRow = Math.max(0, cell.row - range.end.row, range.start.row - cell.row);
      const dCol = Math.max(0, cell.col - range.end.col, range.start.col - cell.col);
      target =
        dRow >= dCol
          ? {
              start: { ...range.start, row: Math.min(range.start.row, cell.row) },
              end: { ...range.end, row: Math.max(range.end.row, cell.row) },
            }
          : {
              start: { ...range.start, col: Math.min(range.start.col, cell.col) },
              end: { ...range.end, col: Math.max(range.end.col, cell.col) },
            };
      if (!raf) raf = requestAnimationFrame(draw);
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      if (raf) cancelAnimationFrame(raf);
      if (fillPreview.current) fillPreview.current.style.display = 'none';
      dragging.current = null;
      const changed =
        target.start.row !== range.start.row ||
        target.end.row !== range.end.row ||
        target.start.col !== range.start.col ||
        target.end.col !== range.end.col;
      if (changed) {
        onFill(range, target);
        onSelectionChange({ anchor: target.start, focus: target.end });
      }
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  // ── pointer: header resize ──────────────────────────────────────────────

  const startResize = (e: React.PointerEvent, axis: 'col' | 'row', index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const start = axis === 'col' ? e.clientX : e.clientY;
    const startSize = axis === 'col' ? columnWidth(sheet, index) : rowHeight(sheet, index);
    const min = axis === 'col' ? MIN_COL_WIDTH : 14;
    let latest = startSize;
    let raf = 0;
    // The guide lives in the scrolled content, so it spans the grid and moves with it.
    const line = document.createElement('div');
    line.style.cssText =
      axis === 'col'
        ? 'position:absolute;top:0;bottom:0;width:1px;background:var(--lumen-accent);pointer-events:none;z-index:5'
        : 'position:absolute;left:0;right:0;height:1px;background:var(--lumen-accent);pointer-events:none;z-index:5';
    content.current?.appendChild(line);
    const place = () => {
      raf = 0;
      const base = axis === 'col' ? (colOffsets[index] ?? 0) : (rowOffsets[index] ?? 0);
      if (axis === 'col') line.style.left = `${base + latest}px`;
      else line.style.top = `${base + latest}px`;
    };
    place();
    const onMove = (ev: PointerEvent) => {
      const delta = (axis === 'col' ? ev.clientX : ev.clientY) - start;
      latest = Math.max(min, Math.round(startSize + delta));
      if (!raf) raf = requestAnimationFrame(place);
    };
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      if (raf) cancelAnimationFrame(raf);
      line.remove();
      if (latest !== startSize) {
        if (axis === 'col') onColumnResize(index, latest);
        else onRowResize(index, latest);
      }
    };
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  };

  // ── rendering ───────────────────────────────────────────────────────────

  const cellRows = [];
  for (let row = window.startRow; row <= window.endRow; row++) {
    const top = rowOffsets[row] ?? 0;
    const height = (rowOffsets[row + 1] ?? top) - top;
    const line = [];
    for (let col = window.startCol; col <= window.endCol; col++) {
      const left = colOffsets[col] ?? 0;
      const width = (colOffsets[col + 1] ?? left) - left;
      const key = coordKey({ col, row });
      const style = styleAt(sheet, key);
      const value = values.get(key)?.value ?? null;
      const isEditing =
        editor?.source === 'grid' && editor.cell.col === col && editor.cell.row === row;
      const selected = inRange({ col, row }, range);
      const isFocus = selection.focus.col === col && selection.focus.row === row;
      const text = isEditing
        ? ''
        : formatValue(value, style?.format ?? 'general', { locale, currency });
      const align = style?.align ?? defaultAlign(value);
      line.push(
        <div
          key={key}
          id={`${gridId}-${key}`}
          role="gridcell"
          tabIndex={-1}
          aria-selected={selected}
          aria-colindex={col + 1}
          className={cx(
            'absolute overflow-hidden border-r border-b border-rule px-1 truncate-1',
            selected && !isFocus && 'bg-selection',
            typeof value === 'number' && 'mono tabular-nums',
            style?.bold && 'font-semibold',
            style?.italic && 'italic',
            isError(value) && 'text-danger',
          )}
          style={{
            left,
            top: 0,
            width,
            height,
            lineHeight: `${height - 1}px`,
            textAlign: align,
          }}
          title={text.length > 12 ? text : undefined}
        >
          {text}
        </div>,
      );
    }
    cellRows.push(
      <div
        key={row}
        role="row"
        tabIndex={-1}
        aria-rowindex={row + 1}
        className="absolute left-0 right-0"
        style={{ transform: `translateY(${top}px)`, height }}
      >
        {line}
      </div>,
    );
  }

  const selLeft = colOffsets[range.start.col] ?? 0;
  const selTop = rowOffsets[range.start.row] ?? 0;
  const selWidth = (colOffsets[range.end.col + 1] ?? selLeft) - selLeft;
  const selHeight = (rowOffsets[range.end.row + 1] ?? selTop) - selTop;
  const focusLeft = colOffsets[selection.focus.col] ?? 0;
  const focusTop = rowOffsets[selection.focus.row] ?? 0;
  const focusWidth = (colOffsets[selection.focus.col + 1] ?? focusLeft) - focusLeft;
  const focusHeight = (rowOffsets[selection.focus.row + 1] ?? focusTop) - focusTop;

  const columns = [];
  for (let col = window.startCol; col <= window.endCol; col++) {
    const left = colOffsets[col] ?? 0;
    const width = (colOffsets[col + 1] ?? left) - left;
    const active = col >= range.start.col && col <= range.end.col;
    columns.push(
      <div
        key={col}
        className={cx(
          'mono absolute top-0 flex items-center justify-center border-r border-b border-rule text-xs select-none',
          active ? 'bg-surface-3 text-ink' : 'text-ink-2',
        )}
        style={{ left, width, height: HEADER_H }}
      >
        {colToLetters(col)}
        <button
          type="button"
          aria-label={`Resize column ${colToLetters(col)}`}
          tabIndex={-1}
          onPointerDown={(e) => startResize(e, 'col', col)}
          onDoubleClick={() => onColumnResize(col, DEFAULT_COL_WIDTH)}
          className="absolute -right-1 top-0 h-full w-2 cursor-col-resize border-0 bg-transparent p-0"
        />
      </div>,
    );
  }

  const rows = [];
  for (let row = window.startRow; row <= window.endRow; row++) {
    const top = rowOffsets[row] ?? 0;
    const height = (rowOffsets[row + 1] ?? top) - top;
    const active = row >= range.start.row && row <= range.end.row;
    rows.push(
      <div
        key={row}
        className={cx(
          'mono absolute left-0 flex items-center justify-end border-r border-b border-rule px-1.5 text-xs tabular-nums select-none',
          active ? 'bg-surface-3 text-ink' : 'text-ink-2',
        )}
        style={{ top, height, width: HEADER_W, lineHeight: `${height - 1}px` }}
      >
        {row + 1}
        <button
          type="button"
          aria-label={`Resize row ${row + 1}`}
          tabIndex={-1}
          onPointerDown={(e) => startResize(e, 'row', row)}
          onDoubleClick={() => onRowResize(row, DEFAULT_ROW_HEIGHT)}
          className="absolute -bottom-1 left-0 h-2 w-full cursor-row-resize border-0 bg-transparent p-0"
        />
      </div>,
    );
  }

  return (
    <div ref={containerRef} className="relative min-h-0 flex-1 bg-surface">
      <div
        className="absolute left-0 top-0 border-r border-b border-rule bg-canvas"
        style={{ width: HEADER_W, height: HEADER_H }}
      />
      <div
        className="absolute top-0 overflow-hidden bg-canvas"
        style={{ left: HEADER_W, right: 0, height: HEADER_H }}
      >
        <div ref={colHeader} className="absolute inset-0" style={{ width: totalWidth }}>
          {columns}
        </div>
      </div>
      <div
        className="absolute left-0 bottom-0 overflow-hidden bg-canvas"
        style={{ top: HEADER_H, width: HEADER_W }}
      >
        <div ref={rowHeader} className="absolute inset-0" style={{ height: totalHeight }}>
          {rows}
        </div>
      </div>
      <div
        ref={scroller}
        role="grid"
        aria-label={`${sheet.name} grid`}
        aria-colcount={size.cols}
        aria-rowcount={size.rows}
        aria-activedescendant={`${gridId}-${coordKey(selection.focus)}`}
        tabIndex={0}
        onScroll={onScroll}
        onPointerDown={onCellPointerDown}
        onPointerMove={onCellPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="lumen-scroll absolute bottom-0 right-0 outline-none"
        style={{ left: HEADER_W, top: HEADER_H }}
      >
        <div
          ref={content}
          className="relative text-base"
          style={{ width: totalWidth, height: totalHeight }}
        >
          {cellRows}
          <div
            aria-hidden
            className="pointer-events-none absolute border border-accent"
            style={{
              transform: `translate(${selLeft}px, ${selTop}px)`,
              width: selWidth,
              height: selHeight,
            }}
          />
          {(selWidth !== focusWidth || selHeight !== focusHeight) && (
            <div
              aria-hidden
              className="pointer-events-none absolute border border-accent"
              style={{
                transform: `translate(${focusLeft}px, ${focusTop}px)`,
                width: focusWidth,
                height: focusHeight,
              }}
            />
          )}
          <div
            ref={fillPreview}
            aria-hidden
            className="pointer-events-none absolute hidden border border-dashed border-accent"
            style={{ width: 0, height: 0 }}
          />
          {editor?.source !== 'grid' && (
            <button
              type="button"
              aria-label="Fill from the selection"
              onPointerDown={onFillPointerDown}
              className="absolute size-2 cursor-crosshair rounded-[1px] border border-surface bg-accent p-0"
              style={{
                transform: `translate(${selLeft + selWidth - 4}px, ${selTop + selHeight - 4}px)`,
              }}
            />
          )}
          {editor?.source === 'grid' && (
            <input
              ref={editorInput}
              value={editor.text}
              aria-label={`Edit ${coordKey(editor.cell)}`}
              onChange={(e) =>
                onEditorChange({
                  ...editor,
                  text: e.target.value,
                  caret: e.target.selectionStart ?? e.target.value.length,
                })
              }
              onSelect={(e) => {
                const caret = (e.target as HTMLInputElement).selectionStart ?? editor.text.length;
                if (caret !== editor.caret) onEditorChange({ ...editor, caret });
              }}
              onPointerDown={(e) => e.stopPropagation()}
              className={cx(
                'absolute z-10 border border-accent bg-surface px-1 text-base text-ink outline-none',
                editor.text.startsWith('=') && 'mono',
              )}
              style={{
                transform: `translate(${colOffsets[editor.cell.col] ?? 0}px, ${rowOffsets[editor.cell.row] ?? 0}px)`,
                minWidth:
                  (colOffsets[editor.cell.col + 1] ?? 0) - (colOffsets[editor.cell.col] ?? 0),
                height: (rowOffsets[editor.cell.row + 1] ?? 0) - (rowOffsets[editor.cell.row] ?? 0),
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
