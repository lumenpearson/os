import { createKernel, type Kernel, useMenuStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import definition from './index';
import Minesweeper from './Minesweeper';
import type { MinesweeperData } from './storage';

const Dummy = () => null;

let kernel: Kernel;
let home: string;
let windowId: string;

/** Let the pending VFS reads and the state updates they cause land. */
async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function mount() {
  const process = kernel.launch('lumen.minesweeper', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider
        value={{ pid: process.pid, windowId, appId: 'lumen.minesweeper', container: null }}
      >
        <DialogProvider>
          <FileDialogProvider>
            <Minesweeper pid={process.pid} windowId={windowId} args={{}} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  await settle();
  return view;
}

const cell = (row: number, column: number, state: string) =>
  screen.getByRole('gridcell', { name: `Row ${row}, column ${column}, ${state}` });

const cellAt = (row: number, column: number) => {
  const found = screen
    .getAllByRole('gridcell')
    .find((el) => el.getAttribute('aria-label')?.startsWith(`Row ${row}, column ${column},`));
  if (!found) throw new Error(`no cell at ${row},${column}`);
  return found;
};

const status = () => screen.getByRole('status');

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

const settingsPath = () => join(home, '.config', 'minesweeper.json');

const saved = () => kernel.vfs.readJson<MinesweeperData>(settingsPath());

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
    expect(definition.id).toBe('lumen.minesweeper');
    expect(definition.name).toBe('Minesweeper');
    expect(definition.category).toBe('games');
    expect(definition.singleton).toBe(true);
    expect(definition.window).toEqual({
      width: 560,
      height: 620,
      minWidth: 300,
      minHeight: 360,
    });
    expect(definition.keywords).toContain('sweeper');
  });
});

describe('a new game', () => {
  it('lays out a beginner field with every cell hidden', async () => {
    await mount();
    const cells = screen.getAllByRole('gridcell');
    expect(cells).toHaveLength(81);
    expect(cells.every((el) => el.getAttribute('aria-label')?.endsWith('hidden'))).toBe(true);
    expect(status()).toHaveTextContent('Ready. 10 mines.');
  });

  it('names the field as a grid of rows and columns', async () => {
    await mount();
    expect(screen.getByRole('grid')).toHaveAccessibleName('Minefield, 9 rows by 9 columns');
  });

  it('holds the clock at zero until a cell is opened', async () => {
    await mount();
    expect(screen.getByText('0:00')).toBeInTheDocument();
  });
});

describe('the first click', () => {
  it('opens the clicked cell and all eight of its neighbours', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(cell(5, 5, 'hidden'));
    expect(cell(5, 5, 'revealed, no adjacent mines')).toBeInTheDocument();
    for (const [row, column] of [
      [4, 4],
      [4, 5],
      [4, 6],
      [5, 4],
      [5, 6],
      [6, 4],
      [6, 5],
      [6, 6],
    ]) {
      expect(cellAt(row as number, column as number).getAttribute('aria-label')).toContain(
        'revealed',
      );
    }
  });

  it('opens a cell on a middle click too, which is the chording button', async () => {
    const user = userEvent.setup();
    await mount();
    await user.pointer({ keys: '[MouseMiddle]', target: cell(5, 5, 'hidden') });
    expect(cellAt(5, 5).getAttribute('aria-label')).toContain('revealed');
  });

  it('is safe wherever it lands, corner included', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(cell(1, 1, 'hidden'));
    expect(cellAt(1, 1).getAttribute('aria-label')).toContain('revealed');
    expect(status()).toHaveTextContent('10 mines left.');
  });
});

describe('flags', () => {
  it('go on with a right click and count down the mines', async () => {
    const user = userEvent.setup();
    await mount();
    await user.pointer({ keys: '[MouseRight]', target: cell(2, 3, 'hidden') });
    expect(cell(2, 3, 'flagged')).toBeInTheDocument();
    expect(screen.getByRole('toolbar')).toHaveTextContent('9');
  });

  it('go on with the F key and refuse to be opened', async () => {
    const user = userEvent.setup();
    await mount();
    const target = cell(2, 3, 'hidden');
    act(() => target.focus());
    await user.keyboard('f');
    expect(cell(2, 3, 'flagged')).toBeInTheDocument();
    await user.click(cellAt(2, 3));
    expect(cellAt(2, 3).getAttribute('aria-label')).toContain('flagged');
  });

  it('come off again on a second flag', async () => {
    const user = userEvent.setup();
    await mount();
    await user.pointer({ keys: '[MouseRight]', target: cell(2, 3, 'hidden') });
    await user.pointer({ keys: '[MouseRight]', target: cellAt(2, 3) });
    expect(cell(2, 3, 'hidden')).toBeInTheDocument();
  });

  it('take a question mark once the option is on', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('options', 'question-marks');
    await user.pointer({ keys: '[MouseRight]', target: cell(2, 3, 'hidden') });
    await user.pointer({ keys: '[MouseRight]', target: cellAt(2, 3) });
    expect(cell(2, 3, 'marked with a question mark')).toBeInTheDocument();
    await waitFor(async () => expect((await saved()).questionMarks).toBe(true));
  });
});

describe('the keyboard', () => {
  it('moves a single tab stop around with the arrows', async () => {
    const user = userEvent.setup();
    await mount();
    const start = cellAt(1, 1);
    act(() => start.focus());
    expect(start).toHaveAttribute('tabindex', '0');
    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(cellAt(2, 2)).toHaveFocus();
    expect(cellAt(2, 2)).toHaveAttribute('tabindex', '0');
    expect(cellAt(1, 1)).toHaveAttribute('tabindex', '-1');
  });

  it('stops at the edge instead of wrapping', async () => {
    const user = userEvent.setup();
    await mount();
    act(() => cellAt(1, 1).focus());
    await user.keyboard('{ArrowLeft}{ArrowUp}');
    expect(cellAt(1, 1)).toHaveFocus();
  });

  it('opens a cell with Enter', async () => {
    const user = userEvent.setup();
    await mount();
    act(() => cellAt(5, 5).focus());
    await user.keyboard('{Enter}');
    expect(cellAt(5, 5).getAttribute('aria-label')).toContain('revealed');
  });

  it('flags with Shift+Enter without opening the cell', async () => {
    const user = userEvent.setup();
    await mount();
    act(() => cellAt(5, 5).focus());
    await user.keyboard('{Shift>}{Enter}{/Shift}');
    expect(cellAt(5, 5).getAttribute('aria-label')).toBe('Row 5, column 5, flagged');
  });
});

describe('the Game menu', () => {
  it('offers the three presets and a custom board', async () => {
    await mount();
    expect(command('game', 'beginner').checked).toBe(true);
    expect(command('game', 'expert').label).toBe('Expert');
    expect(command('game', 'custom').label).toBe('Custom…');
  });

  it('switches to Expert and remembers it', async () => {
    await mount();
    await choose('game', 'expert');
    expect(screen.getAllByRole('gridcell')).toHaveLength(480);
    expect(screen.getByRole('grid')).toHaveAccessibleName('Minefield, 16 rows by 30 columns');
    await waitFor(async () => expect((await saved()).difficulty).toBe('expert'));
  });

  it('deals a fresh board on New Game', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(cell(5, 5, 'hidden'));
    expect(cellAt(5, 5).getAttribute('aria-label')).toContain('revealed');
    await choose('game', 'new');
    expect(
      screen
        .getAllByRole('gridcell')
        .every((el) => el.getAttribute('aria-label')?.endsWith('hidden')),
    ).toBe(true);
  });
});

describe('the custom board dialog', () => {
  it('explains the mine limit and refuses to start', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('game', 'custom');
    const mines = screen.getByLabelText('Mines');
    await user.clear(mines);
    await user.type(mines, '900');
    expect(
      screen.getByText(/board holds 1 to \d+ mines: the first cell you click/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled();
  });

  it('starts the board that was typed', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('game', 'custom');
    for (const [label, value] of [
      ['Width', '10'],
      ['Height', '6'],
      ['Mines', '5'],
    ] as const) {
      const input = screen.getByLabelText(label);
      await user.clear(input);
      await user.type(input, value);
    }
    await user.click(screen.getByRole('button', { name: 'Start' }));
    expect(screen.getAllByRole('gridcell')).toHaveLength(60);
    expect(status()).toHaveTextContent('Ready. 5 mines.');
    await waitFor(async () =>
      expect((await saved()).custom).toEqual({
        width: 10,
        height: 6,
        mines: 5,
      }),
    );
  });
});

describe('best times', () => {
  it('shows a dash for a board that has never been won', async () => {
    await mount();
    await choose('game', 'best-times');
    expect(screen.getByRole('dialog')).toHaveTextContent('Best Times');
    expect(screen.getAllByText('—')).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
  });

  it('reads a time that was recorded earlier', async () => {
    await kernel.vfs.writeJson(
      settingsPath(),
      { difficulty: 'beginner', best: { beginner: { ms: 41_000, at: 0 } } },
      { recursive: true },
    );
    await mount();
    await choose('game', 'best-times');
    expect(screen.getByText('0:41')).toBeInTheDocument();
  });
});
