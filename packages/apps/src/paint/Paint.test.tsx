/**
 * The Paint window. happy-dom has no 2D canvas context, so these cover the
 * chrome — the tools, the options that belong to each one, the menus, the
 * dialogs and what is written to `paint.json`. The pixels themselves are
 * covered by the raster, geometry and flood tests next door, which work on
 * plain buffers for exactly this reason.
 */

import { createKernel, type Kernel, useMenuStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import definition from './index';
import Paint from './Paint';
import type { PaintPrefs } from './prefs';

const Dummy = () => null;

/**
 * happy-dom reports every element as zero-sized and its ResizeObserver is a
 * stub, so the viewport would never settle. This one answers with a real
 * window's box on the first observation, as a browser does.
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
        width: 800,
        height: 560,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 800,
        bottom: 560,
      },
    } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

const originalObserver = globalThis.ResizeObserver;

let kernel: Kernel;
let home: string;
let windowId: string;

async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

/** Past the 250 ms write debounce, so paint.json is on disk. */
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 300));
  });
  await settle();
}

async function mount() {
  const process = kernel.launch('lumen.paint', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.paint', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Paint pid={process.pid} windowId={windowId} args={{}} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  await settle();
  return view;
}

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
  await settle();
}

const prefsPath = () => join(home, '.config', 'paint.json');
const saved = () => kernel.vfs.readJson<PaintPrefs>(prefsPath());

const tools = () => screen.getByRole('toolbar', { name: 'Tools' });
const tool = (name: RegExp) => within(tools()).getByRole('button', { name });

beforeEach(async () => {
  globalThis.ResizeObserver = SizedResizeObserver as unknown as typeof ResizeObserver;
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [{ ...definition, component: Dummy }],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  home = kernel.home;
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalObserver;
});

describe('the app definition', () => {
  it('is the editor the shell expects', () => {
    expect(definition.id).toBe('lumen.paint');
    expect(definition.name).toBe('Paint');
    expect(definition.category).toBe('media');
    expect(definition.keywords).toContain('bitmap');
    // Not a singleton: two pictures should be able to be open at once.
    expect(definition.singleton).toBeUndefined();
    // An editor rather than a viewer, and below Preview, which stays what a
    // double-click on a photo opens.
    expect(definition.fileAssociations?.[0]).toMatchObject({ role: 'editor', priority: 1 });
  });
});

describe('opening the window', () => {
  it('starts on an untitled document at the default size', async () => {
    await mount();
    expect(screen.getByText('800 × 600')).toBeInTheDocument();
    expect(screen.getByTestId('paint-surface')).toBeInTheDocument();
  });

  it('offers every tool, with the pencil chosen', async () => {
    await mount();
    expect(within(tools()).getAllByRole('button')).toHaveLength(10);
    expect(tool(/^Pencil/)).toHaveAttribute('aria-pressed', 'true');
    expect(tool(/^Brush/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('names each tool with its shortcut and what it does', async () => {
    await mount();
    expect(tool(/^Fill/)).toHaveAccessibleName('Fill (G) — Floods the region under the cursor.');
  });
});

describe('choosing a tool', () => {
  it('shows only the options that tool uses', async () => {
    const user = userEvent.setup();
    await mount();
    expect(screen.getByLabelText('Size')).toBeInTheDocument();
    expect(screen.queryByLabelText('Hardness')).not.toBeInTheDocument();

    await user.click(tool(/^Brush/));
    expect(screen.getByLabelText('Hardness')).toBeInTheDocument();

    await user.click(tool(/^Fill/));
    expect(screen.queryByLabelText('Size')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Tolerance')).toBeInTheDocument();
  });

  it('remembers the tool and the brush size', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(tool(/^Eraser/));
    await flush();
    expect((await saved()).tool).toBe('eraser');
  });

  it('takes the tool from a single key over the canvas', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByTestId('paint-surface'));
    await user.keyboard('b');
    expect(tool(/^Brush/)).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('the menus', () => {
  it('keeps undo, redo and the selection commands off until they mean something', async () => {
    await mount();
    expect(command('edit', 'undo').enabled).toBe(false);
    expect(command('edit', 'redo').enabled).toBe(false);
    expect(command('edit', 'cut').enabled).toBe(false);
    expect(command('edit', 'paste').enabled).toBe(false);
  });

  it('turns the selection commands on once everything is selected', async () => {
    await mount();
    await choose('edit', 'select-all');
    expect(screen.getByText('Selection 800 × 600')).toBeInTheDocument();
    expect(command('edit', 'copy').enabled).toBe(true);
    expect(command('edit', 'crop').enabled).toBe(true);

    await choose('edit', 'deselect');
    expect(screen.queryByText(/^Selection/)).not.toBeInTheDocument();
  });

  it('only offers the grid where a pixel is big enough to have one', async () => {
    await mount();
    expect(command('view', 'grid').enabled).toBe(false);
  });

  it('remembers the grid setting', async () => {
    await mount();
    await choose('view', 'grid');
    await flush();
    expect((await saved()).showGrid).toBe(false);
  });
});

describe('the canvas size dialog', () => {
  it('opens on the current size and rejects a width that is not a number', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('image', 'canvas-size');

    const width = screen.getByLabelText('Width');
    expect(width).toHaveValue('800');
    await user.clear(width);
    await user.type(width, 'wide');
    expect(screen.getByText('Whole pixels, 1 to 8192.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('offers the nine anchors, centred', async () => {
    await mount();
    await choose('image', 'canvas-size');
    expect(screen.getByRole('button', { name: 'Anchor centre' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Anchor top left' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('asks for a percentage when scaling, not an anchor', async () => {
    await mount();
    await choose('image', 'scale');
    expect(screen.getByLabelText('Percentage')).toHaveValue('100');
    expect(screen.queryByRole('button', { name: 'Anchor centre' })).not.toBeInTheDocument();
  });

  it('links the height to the width while the proportions are kept', async () => {
    const user = userEvent.setup();
    await mount();
    await choose('image', 'scale');
    const width = screen.getByLabelText('Width');
    await user.clear(width);
    await user.type(width, '400');
    expect(screen.getByLabelText('Height')).toHaveValue('300');
  });
});

describe('the colours', () => {
  it('swaps the foreground and the background', async () => {
    const user = userEvent.setup();
    await mount();
    expect(screen.getByLabelText('Foreground colour')).toHaveValue('#1f2126');
    await user.click(screen.getByRole('button', { name: 'Swap' }));
    expect(screen.getByLabelText('Foreground colour')).toHaveValue('#ffffff');
    expect(screen.getByLabelText('Background colour')).toHaveValue('#1f2126');
  });
});
