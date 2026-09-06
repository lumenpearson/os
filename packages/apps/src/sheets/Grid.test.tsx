/**
 * The grid's pointer path. The offsets, the visible window and the reference
 * parsing have their own tests next door; this covers what the grid itself
 * decides — that a drag only reports when the cell under the pointer changes,
 * so a formula being pointed at is rewritten once per cell rather than once
 * per pointer event.
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Evaluated } from './engine/evaluate';
import { type Coord, rangeOf } from './engine/refs';
import { type EditorState, Grid, type Selection } from './Grid';
import { emptySheet } from './workbook';

const ORIGIN: Coord = { col: 0, row: 0 };
const SELECTION: Selection = { anchor: ORIGIN, focus: ORIGIN };
const EDITOR: EditorState = { cell: ORIGIN, text: '=', caret: 1, source: 'bar' };

/**
 * The grid is measured from `getBoundingClientRect`, which happy-dom answers
 * with zeroes — so a client point is a content point, and the default 96×22
 * cell puts column 1 at x=96 and row 1 at y=22. `mount` undoes the one thing
 * a zero-sized viewport makes the grid do on its own.
 */
const IN_A1 = { clientX: 10, clientY: 10 };
const ALSO_IN_A1 = { clientX: 80, clientY: 18 };
const IN_B1 = { clientX: 120, clientY: 10 };
const ALSO_IN_B1 = { clientX: 150, clientY: 18 };

function mount(
  onReferencePick: (range: ReturnType<typeof rangeOf>) => boolean,
  editor: EditorState | null = EDITOR,
) {
  render(
    <Grid
      sheet={emptySheet('Budget')}
      values={new Map() as Evaluated}
      selection={SELECTION}
      onSelectionChange={() => {}}
      editor={editor}
      onEditorChange={() => {}}
      onCommit={() => {}}
      onFill={() => {}}
      onColumnResize={() => {}}
      onRowResize={() => {}}
      onReferencePick={onReferencePick}
      size={{ rows: 200, cols: 52 }}
      locale="en-GB"
      currency="GBP"
    />,
  );
  const grid = screen.getByRole('grid');
  // happy-dom reports every element as zero-sized, so the grid decides A1 is
  // off screen and scrolls it into view — by exactly one cell each way. Put it
  // back, and a client point is a content point again.
  grid.scrollLeft = 0;
  grid.scrollTop = 0;
  return grid;
}

describe('picking a reference by dragging over the grid', () => {
  it('reports once per cell, not once per pointer event', () => {
    const pick = vi.fn(() => true);
    const grid = mount(pick);

    fireEvent.pointerDown(grid, { button: 0, ...IN_A1 });
    expect(pick).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(grid, ALSO_IN_A1);
    expect(pick).toHaveBeenCalledTimes(1);

    fireEvent.pointerMove(grid, IN_B1);
    expect(pick).toHaveBeenCalledTimes(2);
    expect(pick).toHaveBeenLastCalledWith(rangeOf(ORIGIN, { col: 1, row: 0 }));

    fireEvent.pointerMove(grid, ALSO_IN_B1);
    expect(pick).toHaveBeenCalledTimes(2);
  });

  it('reports again when the drag comes back to a cell it has left', () => {
    const pick = vi.fn(() => true);
    const grid = mount(pick);

    fireEvent.pointerDown(grid, { button: 0, ...IN_A1 });
    fireEvent.pointerMove(grid, IN_B1);
    fireEvent.pointerMove(grid, ALSO_IN_A1);

    expect(pick).toHaveBeenCalledTimes(3);
    expect(pick).toHaveBeenLastCalledWith(rangeOf(ORIGIN, ORIGIN));
  });

  it('starts the next drag clean, so the first cell is picked again', () => {
    const pick = vi.fn(() => true);
    const grid = mount(pick);

    fireEvent.pointerDown(grid, { button: 0, ...IN_A1 });
    fireEvent.pointerMove(grid, IN_B1);
    fireEvent.pointerUp(grid, IN_B1);
    fireEvent.pointerDown(grid, { button: 0, ...IN_B1 });
    fireEvent.pointerMove(grid, ALSO_IN_B1);

    // Down on B1 picks it; the move inside B1 adds nothing.
    expect(pick).toHaveBeenCalledTimes(3);
  });
});

/**
 * The OS reads the hint from the nearest ancestor carrying one, so the sheet's
 * `cell` covers every cell in it — and anything inside that does something
 * else has to say so on itself or be swallowed by it.
 */
describe('what the pointer says the sheet will do', () => {
  it('selects a range over the cells', () => {
    const grid = mount(() => true);
    expect(grid.firstElementChild).toHaveAttribute('data-cursor', 'cell');
  });

  it('draws a fill out of the handle, not a selection', () => {
    mount(() => true);
    expect(screen.getByRole('button', { name: 'Fill from the selection' })).toHaveAttribute(
      'data-cursor',
      'crosshair',
    );
  });

  it('edits text in the open cell editor', () => {
    mount(() => true, { ...EDITOR, source: 'grid' });
    expect(screen.getByRole('textbox', { name: 'Edit A1' })).toHaveAttribute('data-cursor', 'text');
  });

  it('resizes the column and the row from the header edges', () => {
    mount(() => true);
    expect(screen.getByRole('button', { name: 'Resize column A' })).toHaveAttribute(
      'data-cursor',
      'col-resize',
    );
    expect(screen.getByRole('button', { name: 'Resize row 1' })).toHaveAttribute(
      'data-cursor',
      'row-resize',
    );
  });
});
