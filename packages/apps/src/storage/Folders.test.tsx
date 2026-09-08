import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Folders } from './Folders';
import { buildTree } from './tree';

const HOME = '/Users/ada';

const tree = buildTree(HOME, [
  { path: `${HOME}/Videos/film.mp4`, size: 900 },
  { path: `${HOME}/Pictures/photo.png`, size: 300 },
  { path: `${HOME}/notes.md`, size: 100 },
]);

/**
 * happy-dom gives every element a zero size and its ResizeObserver is a stub,
 * so the map would have no room to lay anything out. This one reports a fixed
 * box, which is what a browser would do on the first observation.
 */
class SizedResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    const entry = {
      target,
      contentRect: {
        width: 640,
        height: 400,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 640,
        bottom: 400,
      },
    } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

const original = globalThis.ResizeObserver;

beforeEach(() => {
  globalThis.ResizeObserver = SizedResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  globalThis.ResizeObserver = original;
  cleanup();
});

function map(path = HOME) {
  const onPathChange = vi.fn();
  render(<Folders tree={tree} path={path} onPathChange={onPathChange} />);
  return { onPathChange, listbox: screen.getByRole('listbox') };
}

describe('Folders', () => {
  it('draws one tile per child, largest first', () => {
    map();
    const options = screen.getAllByRole('option');
    expect(options.map((o) => o.getAttribute('data-tile'))).toEqual([
      `${HOME}/Videos`,
      `${HOME}/Pictures`,
      `${HOME}/notes.md`,
    ]);
  });

  it('names each tile with its size and share for a screen reader', () => {
    map();
    expect(
      screen.getByRole('option', { name: 'Videos, folder, 1 file, 900 B, 69% of this folder' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^notes\.md, file, 100 B/ })).toBeInTheDocument();
  });

  it('starts with the largest tile active', () => {
    const { listbox } = map();
    const first = screen.getAllByRole('option')[0];
    expect(listbox).toHaveAttribute('aria-activedescendant', first?.id);
    expect(first).toHaveAttribute('aria-selected', 'true');
  });

  it('moves between siblings by geometry with the arrow keys', () => {
    const { listbox } = map();
    const [videos, pictures, notes] = screen.getAllByRole('option');
    fireEvent.keyDown(listbox, { key: 'ArrowRight' });
    expect(listbox).toHaveAttribute('aria-activedescendant', pictures?.id);
    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    expect(listbox).toHaveAttribute('aria-activedescendant', notes?.id);
    fireEvent.keyDown(listbox, { key: 'ArrowLeft' });
    expect(listbox).toHaveAttribute('aria-activedescendant', videos?.id);
  });

  it('stops at the edge of the map rather than wrapping', () => {
    const { listbox } = map();
    const first = screen.getAllByRole('option')[0];
    fireEvent.keyDown(listbox, { key: 'ArrowLeft' });
    expect(listbox).toHaveAttribute('aria-activedescendant', first?.id);
  });

  it('jumps to the first and last tile with Home and End', () => {
    const { listbox } = map();
    const options = screen.getAllByRole('option');
    fireEvent.keyDown(listbox, { key: 'End' });
    expect(listbox).toHaveAttribute('aria-activedescendant', options[options.length - 1]?.id);
    fireEvent.keyDown(listbox, { key: 'Home' });
    expect(listbox).toHaveAttribute('aria-activedescendant', options[0]?.id);
  });

  it('descends into the focused folder with Enter and comes back with Backspace', () => {
    const { listbox, onPathChange } = map();
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onPathChange).toHaveBeenCalledWith(`${HOME}/Videos`);
  });

  it('goes up from a subfolder with Backspace', () => {
    const { listbox, onPathChange } = map(`${HOME}/Videos`);
    fireEvent.keyDown(listbox, { key: 'Backspace' });
    expect(onPathChange).toHaveBeenCalledWith(HOME);
  });

  it('never descends into a file', () => {
    const { listbox, onPathChange } = map();
    fireEvent.keyDown(listbox, { key: 'End' });
    fireEvent.keyDown(listbox, { key: 'Enter' });
    expect(onPathChange).not.toHaveBeenCalled();
  });

  it('descends when a folder tile is clicked', async () => {
    const { onPathChange } = map();
    await userEvent.click(screen.getAllByRole('option')[1] as Element);
    expect(onPathChange).toHaveBeenCalledWith(`${HOME}/Pictures`);
  });

  it('announces the focused tile in a live region', () => {
    const { listbox } = map();
    const live = document.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('Videos');
    expect(live?.textContent).toContain('900 B');
    fireEvent.keyDown(listbox, { key: 'ArrowRight' });
    expect(live?.textContent).toContain('Pictures');
  });

  it('shows the trail from the root and walks back up through it', async () => {
    const { onPathChange } = map(`${HOME}/Videos`);
    const crumb = screen.getByRole('button', { name: 'ada' });
    await userEvent.click(crumb);
    expect(onPathChange).toHaveBeenCalledWith(HOME);
  });

  it('says so when a folder holds no files', () => {
    render(
      <Folders
        tree={buildTree(HOME, [])}
        path={HOME}
        onPathChange={() => {
          /* not reached */
        }}
      />,
    );
    expect(screen.getByText('No files here')).toBeInTheDocument();
  });
});
