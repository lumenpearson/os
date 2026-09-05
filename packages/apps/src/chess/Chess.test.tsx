import { createKernel, type Kernel, useMenuStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { MemoryAdapter } from '@lumen/vfs';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import Chess from './Chess';
import definition from './index';

const Dummy = () => null;

let kernel: Kernel;
let windowId: string;

/** Let the pending VFS reads and the state updates they cause land. */
async function settle(turns = 6) {
  await act(async () => {
    for (let turn = 0; turn < turns; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function mount() {
  const process = kernel.launch('lumen.chess', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.chess', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Chess pid={process.pid} windowId={windowId} args={{}} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  await settle();
  return view;
}

const cells = () => screen.getAllByRole('gridcell');
const labelOf = (cell: Element) => cell.getAttribute('aria-label') ?? '';

interface Command {
  id?: string;
  label?: string;
  enabled?: boolean;
  checked?: boolean;
  onSelect?: () => void;
  submenu?: Command[];
}

function command(menu: string, id: string): Command {
  const walk = (items: Command[]): Command | undefined => {
    for (const item of items) {
      if (item.id === id) return item;
      const inner = item.submenu ? walk(item.submenu) : undefined;
      if (inner) return inner;
    }
    return undefined;
  };
  const items = (useMenuStore.getState().byWindow[windowId] ?? []).find(
    (m) => m.id === menu,
  )?.items;
  const found = walk((items ?? []) as Command[]);
  if (!found) throw new Error(`no ${menu} > ${id}`);
  return found;
}

async function choose(menu: string, id: string, turns = 6) {
  await act(async () => {
    command(menu, id).onSelect?.();
  });
  await settle(turns);
}

/** The moves on the score sheet, in the order they were played. */
const played = () =>
  screen
    .queryAllByRole('button')
    .filter((el) => el.closest('ol') !== null)
    .map((el) => el.textContent ?? '');

beforeEach(async () => {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [{ ...definition, component: Dummy }],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
});

describe('the board on screen', () => {
  it('draws sixty-four squares with White at the bottom', async () => {
    await mount();
    expect(cells()).toHaveLength(64);
    expect(labelOf(cells()[0] as Element)).toMatch(/^a8, Black rook/);
    expect(labelOf(cells()[63] as Element)).toMatch(/^h1, White rook/);
  });

  it('turns round when the board is flipped, pieces and all', async () => {
    await mount();
    await choose('view', 'flip');
    expect(labelOf(cells()[0] as Element)).toMatch(/^h1, White rook/);
    expect(labelOf(cells()[63] as Element)).toMatch(/^a8, Black rook/);
    expect(command('view', 'flip').checked).toBe(true);
  });

  it('shows what each side has taken beside the moves', async () => {
    await mount();
    expect(screen.getByRole('group', { name: /^White has taken nothing yet/ })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /^Black has taken nothing yet/ })).toBeInTheDocument();
    await choose('view', 'captured');
    expect(screen.queryByRole('group', { name: /has taken/ })).toBeNull();
  });
});

describe('playing as Black', () => {
  it('flips the board and lets the engine open for White', async () => {
    await mount();
    expect(played()).toEqual([]);
    // Gentle looks one move ahead, which is quick enough to wait for here.
    await choose('level', 'level-gentle');
    await choose('game', 'new-black');
    // The search runs in slices on timeouts; give it a few turns of the loop.
    await settle(40);

    expect(labelOf(cells()[0] as Element)).toMatch(/^h1, White rook/);
    expect(command('view', 'flip').checked).toBe(true);
    const moves = played();
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatch(/^[A-Za-z]/);
    expect(screen.getByText(/^Black · Gentle$/)).toBeInTheDocument();
  });

  it('goes back to White without leaving the board turned round', async () => {
    await mount();
    await choose('game', 'new-black');
    await choose('game', 'new-white');
    expect(command('view', 'flip').checked).toBe(false);
    expect(labelOf(cells()[0] as Element)).toMatch(/^a8, Black rook/);
  });
});

describe('the commands the game offers', () => {
  it('offers nothing to undo, redo or restart in a game with no moves', async () => {
    await mount();
    for (const id of ['undo', 'redo', 'restart', 'take-back']) {
      expect(command('game', id).enabled).toBe(false);
    }
    expect(command('game', 'resign').enabled).toBe(true);
  });
});
