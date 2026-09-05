/**
 * The Archive window. These drive the app the way a user does — a launch
 * argument, the menubar, the table, the extraction dialog — and check what
 * reaches the file system. The format itself is tested next door in
 * `zip.test.ts`; what matters here is that the window uses it correctly, and
 * in particular that an archive full of hostile names still cannot write a
 * single byte outside the folder the user chose.
 */

import { createKernel, type Kernel, useMenuStore, useSettingsStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import ArchiveApp from './Archive';
import { crc32 } from './crc32';
import definition from './index';
import type { ArchivePrefs } from './prefs';
import { METHOD_STORED, writeZip, type ZipSource } from './zip';

const Dummy = () => null;

/** happy-dom measures everything as zero, so report a real window's box. */
class SizedResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    const entry = {
      target,
      contentRect: {
        width: 1000,
        height: 620,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 1000,
        bottom: 620,
      },
    } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

const originalObserver = globalThis.ResizeObserver;
const NOW = new Date('2026-09-04T10:30:00Z');
const encode = (value: string) => new TextEncoder().encode(value);

const stored = (name: string, body: string): ZipSource => {
  const data = encode(body);
  return {
    name,
    data,
    method: METHOD_STORED,
    crc: crc32(data),
    uncompressedSize: data.length,
    modifiedAt: new Date(2024, 4, 17, 9, 30, 0).getTime(),
  };
};

let kernel: Kernel;
let home: string;
let windowId: string;

async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

/** Past the 250 ms write debounce, so the preferences file is on disk. */
async function flush() {
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  await settle();
}

async function mount(args: { path?: string } = {}) {
  const process = kernel.launch('lumen.archive', args);
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.archive', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <ArchiveApp pid={process.pid} windowId={windowId} args={args} />
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

function sortCommand(id: string) {
  const item = command('view', 'sort').submenu?.find((entry) => entry.id === id);
  if (!item) throw new Error(`no sort item ${id}`);
  return item;
}

async function choose(menu: string, id: string) {
  await act(async () => {
    command(menu, id).onSelect?.();
  });
  await settle();
}

const grid = () => screen.getByRole('grid', { name: 'Archive contents' });
const rowNames = () =>
  within(grid())
    .queryAllByRole('row')
    .slice(1)
    .map((row) => (row.textContent ?? '').trim());

/** Confirm whichever picker dialog is open. */
async function confirmPicker(user: ReturnType<typeof userEvent.setup>, label: string) {
  await act(async () => {
    await user.click(screen.getByRole('button', { name: label }));
  });
  await settle();
}

const readText = async (path: string) => kernel.vfs.readText(path);

beforeEach(async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [{ ...definition, component: Dummy }],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  home = kernel.home;
  useSettingsStore.getState().patch('region', { locale: 'en-GB', timeZone: 'UTC' });
  globalThis.ResizeObserver = SizedResizeObserver as unknown as typeof ResizeObserver;

  await kernel.vfs.writeFile(
    join(home, 'sample.zip'),
    writeZip([
      stored('readme.txt', 'hello'),
      { name: 'docs', isDirectory: true },
      stored('docs/notes.txt', 'a longer note inside a folder'),
      stored('docs/deep/inner.txt', 'deepest'),
    ]),
    { recursive: true },
  );
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalObserver;
  vi.useRealTimers();
});

describe('the app definition', () => {
  it('is the archive utility the shell expects', () => {
    expect(definition.id).toBe('lumen.archive');
    expect(definition.name).toBe('Archive Utility');
    expect(definition.category).toBe('utilities');
    expect(definition.window).toMatchObject({ width: 820, height: 560, minWidth: 380 });
    expect(definition.fileAssociations).toEqual([
      { extensions: ['.zip'], role: 'editor', priority: 1 },
    ]);
  });
});

describe('an empty window', () => {
  it('says nothing is open and offers the two ways in', async () => {
    await mount();
    expect(screen.getByText('No archive open')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open…' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Archive…' })).toBeInTheDocument();
  });

  it('leaves the archive commands disabled', async () => {
    await mount();
    expect(command('file', 'extract-all').enabled).toBe(false);
    expect(command('edit', 'find').enabled).toBe(false);
  });
});

describe('opening an archive from a launch argument', () => {
  it('lists the top level with folders first', async () => {
    await mount({ path: join(home, 'sample.zip') });
    expect(rowNames()[0]).toContain('docs');
    expect(rowNames().some((name) => name.includes('readme.txt'))).toBe(true);
  });

  it('opens the folders of a small archive so the contents are visible', async () => {
    await mount({ path: join(home, 'sample.zip') });
    expect(rowNames().some((name) => name.includes('notes.txt'))).toBe(true);
  });

  it('shuts and opens a folder from the menubar', async () => {
    await mount({ path: join(home, 'sample.zip') });
    await choose('view', 'collapse-all');
    expect(rowNames().some((name) => name.includes('notes.txt'))).toBe(false);
    await choose('view', 'expand-all');
    expect(rowNames().some((name) => name.includes('notes.txt'))).toBe(true);
  });

  it('reports what the archive holds', async () => {
    await mount({ path: join(home, 'sample.zip') });
    expect(screen.getAllByText(/3 files, 1 folder/).length).toBeGreaterThan(0);
    const details = screen.getByRole('complementary', { name: 'Details' });
    expect(within(details).getByText(join(home, 'sample.zip'))).toBeInTheDocument();
  });

  it('records the archive in Recents', async () => {
    await mount({ path: join(home, 'sample.zip') });
    expect(kernel.state.recents.some((r) => r.path === join(home, 'sample.zip'))).toBe(true);
  });

  it('says what is wrong with a file that is not an archive', async () => {
    await kernel.vfs.writeText(join(home, 'not.zip'), 'plain text, no central directory');
    await mount({ path: join(home, 'not.zip') });
    expect(screen.getByText(/no end-of-central-directory record/)).toBeInTheDocument();
  });
});

describe('finding and sorting', () => {
  it('narrows the list to the matches and prints their whole path', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount({ path: join(home, 'sample.zip') });
    await act(async () => {
      await user.type(screen.getByRole('searchbox', { name: 'Find in archive' }), 'notes');
    });
    await settle();
    expect(rowNames()).toHaveLength(1);
    expect(rowNames()[0]).toContain('docs/notes.txt');
  });

  it('sorts by size when the View menu says so, and remembers it', async () => {
    await mount({ path: join(home, 'sample.zip') });
    await act(async () => {
      sortCommand('sort-size').onSelect?.();
    });
    await flush();
    expect(sortCommand('sort-size').checked).toBe(true);
    const prefs = await kernel.vfs.readJson<ArchivePrefs>(join(home, '.config', 'archive.json'));
    expect(prefs.sort.column).toBe('size');
  });

  it('switches sizes to exact bytes and writes that down', async () => {
    await mount({ path: join(home, 'sample.zip') });
    expect(within(grid()).getAllByText('5 B').length).toBeGreaterThan(0);
    await choose('view', 'exact-bytes');
    await flush();
    const prefs = await kernel.vfs.readJson<ArchivePrefs>(join(home, '.config', 'archive.json'));
    expect(prefs.exactBytes).toBe(true);
  });
});

describe('extracting', () => {
  it('writes every entry under the folder that was chosen', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount({ path: join(home, 'sample.zip') });
    await choose('file', 'extract-all');
    await confirmPicker(user, 'Extract');

    expect(await readText(join(home, 'readme.txt'))).toBe('hello');
    expect(await readText(join(home, 'docs', 'notes.txt'))).toBe('a longer note inside a folder');
    expect(await readText(join(home, 'docs', 'deep', 'inner.txt'))).toBe('deepest');
  });

  it('extracts only what is selected', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount({ path: join(home, 'sample.zip') });
    const readme = within(grid())
      .getAllByRole('row')
      .find((row) => (row.textContent ?? '').includes('readme.txt'));
    await act(async () => {
      await user.click(readme as HTMLElement);
    });
    await settle();

    await choose('file', 'extract-selected');
    await confirmPicker(user, 'Extract');
    expect(await readText(join(home, 'readme.txt'))).toBe('hello');
    await expect(readText(join(home, 'docs', 'notes.txt'))).rejects.toThrow();
  });

  it('keeps a zip-slip archive inside the destination', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const hostile = writeZip([
      stored('../../etc/passwd', 'root:x:0:0'),
      stored('/etc/shadow', 'secret'),
      stored('C:\\Windows\\system32\\hosts', '127.0.0.1'),
    ]);
    await kernel.vfs.mkdir(join(home, 'Out'), { recursive: true });
    await kernel.vfs.writeFile(join(home, 'hostile.zip'), hostile, { recursive: true });
    await mount({ path: join(home, 'hostile.zip') });

    await choose('file', 'extract-all');
    // Step into the folder made for this, then extract into it.
    await act(async () => {
      await user.dblClick(screen.getByText('Out'));
    });
    await settle();
    await confirmPicker(user, 'Extract');

    expect(await readText(join(home, 'Out', 'etc', 'passwd'))).toBe('root:x:0:0');
    expect(await readText(join(home, 'Out', 'etc', 'shadow'))).toBe('secret');
    expect(await readText(join(home, 'Out', 'Windows', 'system32', 'hosts'))).toBe('127.0.0.1');
    await expect(kernel.vfs.readText('/etc/passwd')).rejects.toThrow();
    await expect(kernel.vfs.readText(join(home, 'passwd'))).rejects.toThrow();
  });
});
