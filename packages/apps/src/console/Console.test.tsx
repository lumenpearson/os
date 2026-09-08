/**
 * The Console window. The buffer, the filter and the capture have their own
 * tests next door; what matters here is the window itself — and in particular
 * its first row, which is now the title bar as well as the toolbar.
 */

import { createKernel, type Kernel, useMenuStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { MemoryAdapter } from '@lumen/vfs';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider } from '../_sdk';
import ConsoleApp from './Console';
import definition from './index';

const Dummy = () => null;

/** What the toolbar row measures: a window's width, less the controls. */
let rowWidth = 816;

/**
 * happy-dom measures every element as zero, so report a real box. 816px is
 * what the 900px window this app opens at leaves this row once the 68px the
 * window controls take, and the row's own padding, are gone.
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
        width: rowWidth,
        height: 28,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: rowWidth,
        bottom: 28,
      },
    } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

const originalObserver = globalThis.ResizeObserver;

let kernel: Kernel;
let windowId: string;

async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 4; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

async function mount() {
  const process = kernel.launch('lumen.console', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.console', container: null }}>
        <ConsoleApp pid={process.pid} windowId={windowId} args={{}} />
      </AppProvider>
    </KernelProvider>,
  );
  await settle();
  return view;
}

/** A menu item this window contributed. */
function command(menu: string, id: string) {
  const item = useMenuStore
    .getState()
    .byWindow[windowId]?.find((m) => m.id === menu)
    ?.items.find((i) => i.id === id);
  if (!item) throw new Error(`no ${menu} > ${id}`);
  return item;
}

/** The row the close, minimize and zoom controls are drawn over. */
const firstRow = () => screen.getAllByRole('toolbar')[0] as HTMLElement;

beforeEach(async () => {
  rowWidth = 816;
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [{ ...definition, component: Dummy }],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  globalThis.ResizeObserver = SizedResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalObserver;
});

describe('the app definition', () => {
  it('is the console the shell expects', () => {
    expect(definition.id).toBe('lumen.console');
    expect(definition.category).toBe('developer');
    expect(definition.window).toMatchObject({ minWidth: 420, titleBar: 'inset' });
  });
});

describe('the inset title bar', () => {
  it('keeps the width of the window controls clear at the start of the row', async () => {
    await mount();
    expect(firstRow().className).toContain('ps-(--lumen-window-controls-w)');
  });

  it('names the window in the row, since there is no title bar to do it', async () => {
    await mount();
    expect(within(firstRow()).getByText('Console')).toBeInTheDocument();
  });

  it('still holds the filters and the capture controls beside the name', async () => {
    await mount();
    const row = within(firstRow());
    expect(row.getByRole('group', { name: 'Levels' })).toBeInTheDocument();
    expect(row.getByRole('searchbox', { name: 'Search log' })).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Pause capture' })).toBeInTheDocument();
    // The tail is followed by default, so the button offers to stop.
    expect(row.getByRole('button', { name: 'Stop following the tail' })).toBeInTheDocument();
    expect(row.getByRole('button', { name: 'Export log' })).toBeInTheDocument();
  });

  it('sheds buttons rather than overflow when the window is at its narrowest', async () => {
    // A 420px window: the row has 336px left once the controls and its own
    // padding are taken out, which is not enough for all of it.
    rowWidth = 336;
    await mount();
    const row = within(firstRow());
    expect(row.getByText('Console')).toBeInTheDocument();
    expect(row.getByRole('group', { name: 'Levels' })).toBeInTheDocument();
    expect(row.getByRole('searchbox', { name: 'Search log' })).toBeInTheDocument();
    // Pause stays: the row is the only place the paused state shows.
    expect(row.getByRole('button', { name: 'Pause capture' })).toBeInTheDocument();
    expect(row.queryByRole('button', { name: 'Export log' })).not.toBeInTheDocument();
    expect(row.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument();
    expect(row.queryByRole('button', { name: 'Stop following the tail' })).not.toBeInTheDocument();
  });

  it('keeps every dropped button on the menubar', async () => {
    await mount();
    // A narrow window sheds Export, Clear and Follow Tail from the row.
    expect(command('file', 'file.export').shortcut).toBe('Mod+S');
    expect(command('file', 'file.clear').shortcut).toBe('Mod+K');
    expect(command('view', 'view.follow').shortcut).toBe('Mod+T');
  });
});
