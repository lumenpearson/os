import { createKernel, type Kernel, useMenuStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import { generate } from './generate';
import { CELLS, formatGrid } from './grid';
import definition from './index';
import { createRng } from './rng';
import Sudoku from './Sudoku';
import type { SudokuData } from './storage';

const Dummy = () => null;

let kernel: Kernel;
let home: string;
let windowId: string;

/** Let the pending VFS reads and the state updates they cause land. */
async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function mount() {
  const process = kernel.launch('lumen.sudoku', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.sudoku', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Sudoku pid={process.pid} windowId={windowId} args={{}} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  await settle();
  return view;
}

const cells = () => screen.getAllByRole('gridcell');

/** The first cell the puzzle left empty. */
function firstEmpty(): HTMLElement {
  const found = cells().find((el) => el.getAttribute('aria-label')?.endsWith('empty'));
  if (!found) throw new Error('every cell is filled');
  return found;
}

function command(menu: string, id: string) {
  const walk = (
    items: Array<{ id?: string; submenu?: unknown }>,
  ): { id?: string; onSelect?: () => void; enabled?: boolean; checked?: boolean } | undefined => {
    for (const item of items) {
      if (item.id === id) return item;
      const inner = item.submenu
        ? walk(item.submenu as Array<{ id?: string; submenu?: unknown }>)
        : undefined;
      if (inner) return inner;
    }
    return undefined;
  };
  const found = walk(
    useMenuStore.getState().byWindow[windowId]?.find((m) => m.id === menu)?.items ?? [],
  );
  if (!found) throw new Error(`no ${menu} > ${id}`);
  return found;
}

async function choose(menu: string, id: string) {
  await act(async () => {
    command(menu, id).onSelect?.();
  });
  await settle();
}

const dataPath = () => join(home, '.config', 'sudoku.json');
const saved = () => kernel.vfs.readJson<SudokuData>(dataPath());

/** useJsonFile debounces its writes; wait past that. */
async function flushWrites() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 320));
  });
}

beforeEach(async () => {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [{ ...definition, component: Dummy }],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  home = kernel.home;
});

describe('the app definition', () => {
  it('is the game the shell expects', () => {
    expect(definition.id).toBe('lumen.sudoku');
    expect(definition.name).toBe('Sudoku');
    expect(definition.category).toBe('games');
    expect(definition.window).toEqual({
      width: 620,
      height: 720,
      minWidth: 340,
      minHeight: 460,
      titleBar: 'inset',
    });
    expect(definition.keywords).toContain('sudoku');
  });
});

describe('a new puzzle', () => {
  it('lays out eighty-one cells with some clues already on them', async () => {
    await mount();
    expect(cells()).toHaveLength(CELLS);
    const clues = cells().filter((el) => el.getAttribute('aria-label')?.endsWith('clue'));
    expect(clues.length).toBeGreaterThanOrEqual(17);
    expect(clues.length).toBeLessThan(CELLS);
  });

  it('names the board and says what is left of it', async () => {
    await mount();
    expect(screen.getByRole('grid')).toHaveAccessibleName('Sudoku board, nine by nine');
    expect(screen.getByText(/cells left$/)).toBeInTheDocument();
  });

  it('starts the clock at zero', async () => {
    await mount();
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });
});

describe('writing a digit', () => {
  it('types into the cell the cursor is on', async () => {
    const user = userEvent.setup();
    await mount();
    const cell = firstEmpty();
    await user.click(cell);
    await user.keyboard('7');
    expect(cell.getAttribute('aria-label')).toMatch(/, 7$/);
  });

  it('clears it again with Backspace', async () => {
    const user = userEvent.setup();
    await mount();
    const cell = firstEmpty();
    await user.click(cell);
    await user.keyboard('7{Backspace}');
    expect(cell.getAttribute('aria-label')).toMatch(/empty$/);
  });

  it('refuses to write over a clue', async () => {
    const user = userEvent.setup();
    await mount();
    const clue = cells().find((el) => el.getAttribute('aria-label')?.endsWith('clue'));
    if (!clue) throw new Error('no clue on the board');
    const before = clue.getAttribute('aria-label');
    await user.click(clue);
    await user.keyboard('5');
    expect(clue.getAttribute('aria-label')).toBe(before);
  });

  it('walks the board with the arrow keys', async () => {
    const user = userEvent.setup();
    await mount();
    const first = cells()[0] as HTMLElement;
    await user.click(first);
    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(document.activeElement?.getAttribute('aria-label')).toContain('row 2, column 2');
  });

  it('stops at the edge rather than wrapping round', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(cells()[0] as HTMLElement);
    await user.keyboard('{ArrowUp}{ArrowLeft}');
    expect(document.activeElement?.getAttribute('aria-label')).toContain('row 1, column 1');
  });

  it('pencils a digit in once the mode is on', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('view', 'pencil');
    const cell = firstEmpty();
    await user.click(cell);
    await user.keyboard('4');
    expect(cell.getAttribute('aria-label')).toMatch(/pencilled 4$/);
  });

  it('fills a cell from the number pad', async () => {
    const user = userEvent.setup();
    await mount();
    const cell = firstEmpty();
    await user.click(cell);
    await user.click(screen.getByRole('button', { name: 'Write 3' }));
    expect(cell.getAttribute('aria-label')).toMatch(/, 3$/);
  });
});

describe('the commands', () => {
  it('undoes and redoes a move', async () => {
    const user = userEvent.setup();
    await mount();
    const cell = firstEmpty();
    await user.click(cell);
    await user.keyboard('6');
    await choose('edit', 'undo');
    expect(cell.getAttribute('aria-label')).toMatch(/empty$/);
    await choose('edit', 'redo');
    expect(cell.getAttribute('aria-label')).toMatch(/, 6$/);
  });

  it('has nothing to undo on a fresh puzzle', async () => {
    await mount();
    expect(command('edit', 'undo').enabled).toBe(false);
    expect(command('edit', 'redo').enabled).toBe(false);
  });

  it('says what a check found', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('game', 'check');
    expect(screen.getByRole('status')).toHaveTextContent('Nothing wrong so far.');

    // Every digit but one is wrong in a given cell, so one of these two is.
    const cell = firstEmpty();
    await user.click(cell);
    await user.keyboard('1');
    await choose('game', 'check');
    const first = screen.getByRole('status').textContent;
    if (first === 'Nothing wrong so far.') {
      await user.keyboard('2');
      await choose('game', 'check');
    }
    expect(screen.getByRole('status')).toHaveTextContent('1 entry is wrong.');
  });

  it('fills one cell with a hint', async () => {
    await mount();
    const before = cells().filter((el) => el.getAttribute('aria-label')?.endsWith('empty')).length;
    await choose('game', 'hint');
    const after = cells().filter((el) => el.getAttribute('aria-label')?.endsWith('empty')).length;
    expect(after).toBe(before - 1);
    expect(screen.getByRole('status')).toHaveTextContent('Filled one cell in.');
  });

  it('deals a new puzzle at the difficulty the menu names', async () => {
    await mount();
    await choose('game', 'new-hard');
    expect(screen.getByText(/^Hard —/)).toBeInTheDocument();
    expect(command('game', 'new-hard').checked).toBe(true);
  }, 20000);
});

describe('the view options', () => {
  it('turns the timer off and on', async () => {
    await mount();
    expect(screen.getByText('0:00')).toBeInTheDocument();
    await choose('view', 'timer');
    expect(screen.queryByText('0:00')).not.toBeInTheDocument();
    await choose('view', 'timer');
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });

  it('remembers the choice in the settings file', async () => {
    await mount();
    await choose('view', 'highlight');
    await flushWrites();
    expect((await saved()).prefs.highlight).toBe(false);
  });
});

describe('saving', () => {
  it('writes the game in progress and reads it back', async () => {
    const user = userEvent.setup();
    const view = await mount();
    const cell = firstEmpty();
    const name = cell.getAttribute('aria-label') as string;
    await user.click(cell);
    await user.keyboard('8');
    await flushWrites();

    const file = await saved();
    expect(file.game).not.toBeNull();
    expect(file.game?.values).toHaveLength(CELLS);

    view.unmount();
    await mount();
    const restored = cells().find((el) =>
      el.getAttribute('aria-label')?.startsWith(name.replace(', empty', '')),
    );
    expect(restored?.getAttribute('aria-label')).toMatch(/, 8$/);
  });

  it('deals a fresh puzzle when the saved one does not hold together', async () => {
    await kernel.vfs.writeJson(
      dataPath(),
      { prefs: { difficulty: 'easy' }, game: { puzzle: 'rubbish' } },
      { recursive: true },
    );
    await mount();
    expect(cells()).toHaveLength(CELLS);
    expect(screen.getByText(/cells left$/)).toBeInTheDocument();
  });
});

describe('finishing', () => {
  /** A saved game one cell short of solved, so the last move can be made. */
  async function nearlyDone() {
    const made = generate(createRng(7), 'easy');
    const last = made.puzzle.indexOf(0);
    const values = made.solution.slice();
    values[last] = 0;
    await kernel.vfs.writeJson(
      dataPath(),
      {
        prefs: { difficulty: 'easy', pencil: false, highlight: true, timer: true },
        game: {
          puzzle: formatGrid(made.puzzle),
          solution: formatGrid(made.solution),
          values: formatGrid(values),
          marks: new Array(CELLS).fill(0),
          difficulty: 'easy',
          seed: 7,
          elapsedMs: 0,
        },
      },
      { recursive: true },
    );
    return { answer: made.solution[last] as number };
  }

  it('says so, and takes no more digits', async () => {
    const user = userEvent.setup();
    const { answer } = await nearlyDone();
    await mount();
    const cell = firstEmpty();
    await user.click(cell);
    await user.keyboard(String(answer));

    expect(screen.getByText(/\u2014 solved$/)).toBeInTheDocument();
    expect(cell.getAttribute('aria-label')).toMatch(new RegExp(`, ${answer}$`));

    await user.keyboard(answer === 1 ? '2' : '1');
    expect(cell.getAttribute('aria-label')).toMatch(new RegExp(`, ${answer}$`));
    expect(screen.getByRole('button', { name: 'Write 5' })).toBeDisabled();
  });
});

/**
 * happy-dom gives every element a zero size and its ResizeObserver never
 * fires, so a window has to be handed a width before anything that folds at
 * one can be tested. Reports the box once, on the first observation, the way
 * a browser does; the returned function puts the original back.
 */
function observeWidth(width: number, height: number): () => void {
  const original = globalThis.ResizeObserver;
  class SizedResizeObserver {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      const contentRect = {
        width,
        height,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: width,
        bottom: height,
      };
      this.callback(
        [{ target, contentRect } as unknown as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = SizedResizeObserver as unknown as typeof ResizeObserver;
  return () => {
    globalThis.ResizeObserver = original;
  };
}

describe('the row the window is dragged by', () => {
  it('keeps the window controls clear and says which window this is', async () => {
    await mount();
    const toolbar = screen.getByRole('toolbar');
    // The title bar is inset, so the controls are drawn over this row.
    expect(toolbar.className).toContain('ps-(--lumen-window-controls-w)');
    expect(within(toolbar).getByText('Sudoku')).toBeInTheDocument();
    // And the row still carries the game's own commands.
    expect(within(toolbar).getByRole('button', { name: 'New puzzle' })).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'Check' })).toBeInTheDocument();
  });
});

describe('the toolbar at the smallest window', () => {
  it('gives up Undo and Redo rather than the name and the commands', async () => {
    // 340 is the declared minimum width, less the 68 the controls hold.
    const restore = observeWidth(340, 720);
    try {
      await mount();
      const toolbar = screen.getByRole('toolbar');
      expect(within(toolbar).getByText('Sudoku')).toBeInTheDocument();
      expect(within(toolbar).getByRole('button', { name: 'New puzzle' })).toBeInTheDocument();
      expect(within(toolbar).getByRole('button', { name: 'Check' })).toBeInTheDocument();
      // Undo and Redo stay on the Edit menu, under Mod+Z and Mod+Shift+Z.
      expect(within(toolbar).queryByRole('button', { name: 'Undo' })).toBeNull();
      expect(command('edit', 'undo')).toBeDefined();
    } finally {
      restore();
    }
  });
});
