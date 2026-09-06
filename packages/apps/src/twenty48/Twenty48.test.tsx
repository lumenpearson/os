import { createKernel, type Kernel, useMenuStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import definition from './index';
import type { Twenty48Data } from './storage';
import Twenty48 from './Twenty48';

const Dummy = () => null;

let kernel: Kernel;
let home: string;
let windowId: string;

/** Let the pending VFS reads and the state updates they cause land. */
async function settle(ms = 0) {
  await act(async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    if (ms > 0) await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

async function mount() {
  const process = kernel.launch('lumen.2048', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.2048', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Twenty48 pid={process.pid} windowId={windowId} args={{}} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  await settle();
  return view;
}

const cells = () => screen.getAllByRole('gridcell');

const occupied = () =>
  cells().filter((el) => !el.getAttribute('aria-label')?.endsWith('empty')).length;

/** The board read back off the cell names, which is what a reader would hear. */
const boardSum = () =>
  cells().reduce((sum, el) => {
    const label = el.getAttribute('aria-label') ?? '';
    const value = Number.parseInt(label.slice(label.lastIndexOf(' ') + 1), 10);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

const movesPlayed = () => {
  const label = screen.queryByText(/^[\d,. ]+ moves?$/)?.textContent ?? '0';
  return Number.parseInt(label, 10);
};

/** A menu item this window contributed. */
function command(menu: string, id: string) {
  const item = useMenuStore
    .getState()
    .byWindow[windowId]?.find((m) => m.id === menu)
    ?.items.find((i) => i.id === id);
  if (!item) throw new Error(`no ${menu} > ${id}`);
  return item;
}

async function choose(menu: string, id: string) {
  await act(async () => {
    command(menu, id).onSelect?.();
  });
}

/** Slide until something moves; two tiles cannot resist all four directions. */
async function playOne(user: ReturnType<typeof userEvent.setup>, keys: string[]) {
  const before = movesPlayed();
  screen.getByRole('grid').focus();
  for (const key of keys) {
    await user.keyboard(key);
    if (movesPlayed() > before) return;
  }
  throw new Error('no direction moved the board');
}

const ARROWS = ['{ArrowLeft}', '{ArrowUp}', '{ArrowRight}', '{ArrowDown}'];

const dataPath = () => join(home, '.config', '2048.json');
const saved = () => kernel.vfs.readJson<Twenty48Data>(dataPath());

beforeEach(async () => {
  cleanup();
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
    expect(definition.id).toBe('lumen.2048');
    expect(definition.name).toBe('2048');
    expect(definition.category).toBe('games');
    expect(definition.singleton).toBe(true);
    expect(definition.window).toEqual({
      width: 460,
      height: 620,
      minWidth: 320,
      minHeight: 440,
      titleBar: 'inset',
    });
    expect(definition.keywords).toContain('2048');
  });
});

describe('a new game', () => {
  it('lays out sixteen cells with two of them filled', async () => {
    await mount();
    expect(cells()).toHaveLength(16);
    expect(occupied()).toBe(2);
  });

  it('names the board and takes the focus so the arrows work', async () => {
    await mount();
    const grid = screen.getByRole('grid');
    expect(grid).toHaveAccessibleName(/2048 board, 4 rows by 4 columns/);
    expect(document.activeElement).toBe(grid);
  });

  it('opens on nothing scored and nothing to take back', async () => {
    await mount();
    expect(screen.getByText('Score').nextSibling).toHaveTextContent('0');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(command('game', 'undo').enabled).toBe(false);
  });
});

describe('playing', () => {
  it('slides on an arrow key and puts one new tile down', async () => {
    const user = userEvent.setup();
    await mount();
    const before = boardSum();
    await playOne(user, ARROWS);
    expect(movesPlayed()).toBe(1);
    // A move keeps the total and adds the one tile it drew: a 2 or a 4.
    expect(boardSum() - before).toBeGreaterThanOrEqual(2);
    expect(boardSum() - before).toBeLessThanOrEqual(4);
  });

  it('slides on WASD as well', async () => {
    const user = userEvent.setup();
    await mount();
    await playOne(user, ['a', 'w', 'd', 's']);
    expect(movesPlayed()).toBe(1);
  });

  it('takes the move back', async () => {
    const user = userEvent.setup();
    await mount();
    const before = boardSum();
    await playOne(user, ARROWS);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(occupied()).toBe(2);
    expect(boardSum()).toBe(before);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
  });

  it('deals a fresh board from the menu', async () => {
    const user = userEvent.setup();
    await mount();
    await playOne(user, ARROWS);
    await choose('game', 'new');
    expect(occupied()).toBe(2);
    expect(screen.getByText('0 moves')).toBeInTheDocument();
  });
});

describe('the View menu', () => {
  it('takes the best score off the screen and puts it back', async () => {
    await mount();
    expect(screen.getByText('Best')).toBeInTheDocument();
    await choose('view', 'best');
    await settle();
    expect(screen.queryByText('Best')).toBeNull();
    expect(command('view', 'best').checked).toBe(false);
    await choose('view', 'best');
    await settle();
    expect(screen.getByText('Best')).toBeInTheDocument();
  });

  it('remembers the animation switch', async () => {
    await mount();
    expect(command('view', 'animations').checked).toBe(true);
    await choose('view', 'animations');
    await settle(320);
    expect((await saved()).animations).toBe(false);
  });
});

describe('the file under the home directory', () => {
  it('keeps the game so it comes back on the next launch', async () => {
    const user = userEvent.setup();
    const view = await mount();
    await playOne(user, ARROWS);
    await settle(320);
    const before = (await saved()).game;
    expect(before?.board).toHaveLength(16);
    expect(before?.moves).toBe(1);
    const sum = boardSum();

    view.unmount();
    await mount();
    expect(boardSum()).toBe(sum);
    expect(screen.getByText('1 move')).toBeInTheDocument();
  });

  it('deals a new game when the file holds a board that cannot be one', async () => {
    await kernel.vfs.writeJson(
      dataPath(),
      { best: 40, game: { board: [1, 2, 3] } },
      {
        recursive: true,
      },
    );
    await mount();
    expect(occupied()).toBe(2);
    expect(screen.getByText('Best').nextSibling).toHaveTextContent('40');
  });
});

describe('the row the window is dragged by', () => {
  it('keeps the window controls clear and says which window this is', async () => {
    await mount();
    const toolbar = screen.getByRole('toolbar');
    // The title bar is inset, so the controls are drawn over this row.
    expect(toolbar.className).toContain('ps-(--lumen-window-controls-w)');
    expect(within(toolbar).getByText('2048')).toBeInTheDocument();
    expect(within(toolbar).getByRole('button', { name: 'New game' })).toBeInTheDocument();
  });
});
