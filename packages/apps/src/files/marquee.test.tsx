import type { DirEntry } from '@lumen/vfs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntryListBox } from './EntryListBox';
import { EMPTY_SELECTION, type Selection } from './logic';

/**
 * The rectangle in a file listing, driven the way a pointer drives it.
 * happy-dom does no layout, so the boxes the drag measures are stubbed: the
 * list sits at the page origin and each row is 200 wide and 20 tall, stacked.
 */
const ROW = { width: 200, height: 20 };

const entries: DirEntry[] = ['alpha.txt', 'beta.txt', 'gamma.txt'].map((name, i) => ({
  name,
  path: `/home/ada/${name}`,
  kind: 'file',
  size: 10 * (i + 1),
  modifiedAt: 0,
  createdAt: 0,
}));

function boxAt(x: number, y: number, width: number, height: number): DOMRect {
  const rect = { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height };
  return { ...rect, toJSON: () => rect } as DOMRect;
}

let restore: (() => void) | null = null;

beforeEach(() => {
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function stub(this: Element) {
    const path = this.getAttribute('data-path');
    if (path === null) return boxAt(0, 0, ROW.width, ROW.height * entries.length);
    const index = entries.findIndex((e) => e.path === path);
    return boxAt(0, index * ROW.height, ROW.width, ROW.height);
  };
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
  Element.prototype.hasPointerCapture = () => false;
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
  restore = () => {
    Element.prototype.getBoundingClientRect = original;
  };
});

afterEach(() => {
  restore?.();
  vi.unstubAllGlobals();
  cleanup();
});

function List({ onChange }: { onChange: (s: Selection) => void }) {
  return (
    <EntryListBox
      marquee
      entries={entries}
      selection={EMPTY_SELECTION}
      layout="grid"
      label="Files"
      onSelectionChange={onChange}
      onOpen={() => {}}
      onContextMenu={() => {}}
      onDragStart={() => {}}
      onDragOver={() => {}}
      onDrop={() => {}}
      renderItem={(entry) => <span>{entry.name}</span>}
      itemClassName={() => undefined}
    />
  );
}

/** Press on the list itself — not on a row — and drag to (x, y). */
function drag(to: { x: number; y: number }) {
  const list = screen.getByRole('listbox');
  fireEvent.pointerDown(list, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
  act(() => {
    fireEvent.pointerMove(window, { clientX: to.x, clientY: to.y, pointerId: 1 });
  });
  return list;
}

describe('the selection rectangle in a file listing', () => {
  it('selects the rows the rectangle covers', () => {
    const onChange = vi.fn();
    render(<List onChange={onChange} />);
    drag({ x: 120, y: 25 });
    const last = onChange.mock.calls.at(-1)?.[0] as Selection;
    // Two rows lie within 25px of the top; the third starts at 40.
    expect([...last.keys].sort()).toEqual([entries[0]?.path, entries[1]?.path]);
  });

  it('draws the rectangle the drag spans', () => {
    render(<List onChange={vi.fn()} />);
    drag({ x: 120, y: 25 });
    const band = screen.getByTestId('entry-marquee');
    expect(band.hidden).toBe(false);
    expect(band.style.width).toBe('120px');
    expect(band.style.height).toBe('25px');
  });

  it('stays a click when the pointer never travels', () => {
    const onChange = vi.fn();
    render(<List onChange={onChange} />);
    drag({ x: 1, y: 1 });
    expect(screen.getByTestId('entry-marquee').hidden).toBe(true);
    // The press still clears the selection, which is what a click on empty
    // space means; it just never becomes a rectangle.
    const last = onChange.mock.calls.at(-1)?.[0] as Selection;
    expect([...last.keys]).toEqual([]);
  });

  it('does not start from a press on a row, which is a click on that row', () => {
    render(<List onChange={vi.fn()} />);
    const row = screen.getByText('alpha.txt');
    fireEvent.pointerDown(row, { button: 0, clientX: 0, clientY: 0, pointerId: 1 });
    act(() => {
      fireEvent.pointerMove(window, { clientX: 120, clientY: 25, pointerId: 1 });
    });
    expect(screen.getByTestId('entry-marquee').hidden).toBe(true);
  });

  it('is absent from a list that did not ask for one', () => {
    cleanup();
    render(
      <EntryListBox
        entries={entries}
        selection={EMPTY_SELECTION}
        layout="rows"
        label="Files"
        onSelectionChange={() => {}}
        onOpen={() => {}}
        onContextMenu={() => {}}
        onDragStart={() => {}}
        onDragOver={() => {}}
        onDrop={() => {}}
        renderItem={(entry) => <span>{entry.name}</span>}
        itemClassName={() => undefined}
      />,
    );
    expect(screen.queryByTestId('entry-marquee')).toBeNull();
  });
});
