import { createKernel, type Kernel, useClipboardStore, useMenuStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import Clipboard from './Clipboard';
import definition from './index';
import type { ClipboardData } from './storage';

const Dummy = () => null;

let kernel: Kernel;
let home: string;
let windowId: string;

/** Let the pending VFS reads, and the debounced write behind them, land. */
async function settle(ms = 0) {
  await act(async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  });
}

async function mount() {
  const process = kernel.launch('lumen.clipboard', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider
        value={{ pid: process.pid, windowId, appId: 'lumen.clipboard', container: null }}
      >
        <DialogProvider>
          <FileDialogProvider>
            <Clipboard pid={process.pid} windowId={windowId} args={{}} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  await settle();
  return view;
}

const list = () => screen.getByRole('list', { name: 'Clipboard items' });
const rows = () => within(list()).getAllByRole('button');
const rowNames = () => rows().map((row) => row.textContent ?? '');
const clipboard = () => useClipboardStore.getState();

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

const savedFile = () => kernel.vfs.readJson<ClipboardData>(join(home, '.config', 'clipboard.json'));

/** Three text copies and one file copy, oldest first, as the kernel would record them. */
function seedHistory() {
  const store = clipboard();
  store.copyText('first snippet');
  store.copyText('SELECT * FROM users\nWHERE id = 1');
  store.copyFiles(['/home/ada/Documents/report.pdf', '/home/ada/Documents/notes.md'], 'cut');
  store.copyText('https://lumen.example/docs');
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
  useClipboardStore.setState({ item: null, history: [] });
});

describe('the app definition', () => {
  it('is the clipboard viewer the shell expects', () => {
    expect(definition.id).toBe('lumen.clipboard');
    expect(definition.name).toBe('Clipboard');
    expect(definition.category).toBe('utilities');
    expect(definition.singleton).toBe(true);
    expect(definition.window).toEqual({
      width: 760,
      height: 520,
      minWidth: 380,
      minHeight: 320,
      titleBar: 'inset',
    });
    expect(definition.keywords).toContain('history');
  });
});

describe('the list', () => {
  it('shows what Lumen has copied, newest first, one line each', async () => {
    seedHistory();
    await mount();
    expect(rowNames()[0]).toContain('https://lumen.example/docs');
    expect(rowNames()[2]).toContain('SELECT * FROM users');
    expect(rowNames()[3]).toContain('first snippet');
  });

  it('says what was done to copied files and how many there were', async () => {
    seedHistory();
    await mount();
    expect(rowNames()[1]).toContain('report.pdf and 1 more');
    expect(rowNames()[1]).toContain('Cut · 2 paths');
  });

  it('shows the same text once however often it was copied', async () => {
    clipboard().copyText('repeated');
    clipboard().copyText('between');
    clipboard().copyText('repeated');
    await mount();
    expect(rowNames().filter((name) => name.includes('repeated'))).toHaveLength(1);
    expect(rowNames()[0]).toContain('repeated');
  });

  it('marks the item that is on the clipboard now', async () => {
    seedHistory();
    await mount();
    expect(rows()[0]?.textContent).toContain('on the clipboard');
    expect(rows()[1]?.textContent).not.toContain('on the clipboard');
  });

  it('puts the whole of the selected item in the detail pane', async () => {
    seedHistory();
    const user = userEvent.setup();
    await mount();
    await user.click(rows()[2] as HTMLElement);
    expect(screen.getByText('SELECT * FROM users WHERE id = 1')).toBeInTheDocument();
    expect(screen.getByText(/32 characters · 2 lines/)).toBeInTheDocument();
  });
});

describe('putting an item back on the clipboard', () => {
  it('is what a click on a row does', async () => {
    seedHistory();
    const user = userEvent.setup();
    await mount();
    await user.click(rows()[3] as HTMLElement);
    expect(clipboard().item?.text).toBe('first snippet');
    expect(screen.getByRole('status')).toHaveTextContent('Put back on the clipboard');
  });

  it('is what Enter on a row does, while the arrow keys only move the selection', async () => {
    seedHistory();
    const user = userEvent.setup();
    await mount();
    (rows()[0] as HTMLElement).focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(clipboard().item?.text).toBe('https://lumen.example/docs');
    await user.keyboard('{Enter}');
    expect(clipboard().item?.text).toBe('SELECT * FROM users\nWHERE id = 1');
  });

  it('hands a file operation back as the operation it was', async () => {
    seedHistory();
    const user = userEvent.setup();
    await mount();
    await user.click(rows()[1] as HTMLElement);
    expect(clipboard().item?.files).toEqual({
      paths: ['/home/ada/Documents/report.pdf', '/home/ada/Documents/notes.md'],
      operation: 'cut',
    });
  });

  it('moves the item to the top of the list rather than listing it twice', async () => {
    seedHistory();
    const user = userEvent.setup();
    await mount();
    await user.click(rows()[3] as HTMLElement);
    expect(rowNames().filter((name) => name.includes('first snippet'))).toHaveLength(1);
    expect(rowNames()[0]).toContain('first snippet');
  });
});

describe('pinning', () => {
  it('keeps the app’s own copy in the account’s file', async () => {
    seedHistory();
    const user = userEvent.setup();
    await mount();
    await user.click(rows()[2] as HTMLElement);
    await choose('edit', 'pin');
    await settle(120);

    expect(within(list()).getByText('Pinned')).toBeInTheDocument();
    const file = await savedFile();
    expect(file.pins).toHaveLength(1);
    expect(file.pins[0]?.text).toBe('SELECT * FROM users\nWHERE id = 1');
  });

  it('keeps a pinned item after the kernel’s ring has rolled past it', async () => {
    seedHistory();
    const user = userEvent.setup();
    await mount();
    await user.click(rows()[2] as HTMLElement);
    await choose('edit', 'pin');
    await settle(120);

    await act(async () => {
      useClipboardStore.setState({ history: [], item: null });
    });
    expect(rowNames()).toHaveLength(1);
    expect(rowNames()[0]).toContain('SELECT * FROM users');
    expect(
      screen.getByText(/Clipboard holds its own copy; the system clipboard has rolled past it/),
    ).toBeInTheDocument();
  });

  it('says so plainly while the system clipboard still holds it too', async () => {
    clipboard().copyText('kept');
    await mount();
    await choose('edit', 'pin');
    await settle(120);
    expect(screen.getByText(/the system clipboard still has it too/)).toBeInTheDocument();
  });

  it('unpins from the same menu item, which changes its name', async () => {
    clipboard().copyText('kept');
    await mount();
    await choose('edit', 'pin');
    await settle(120);
    expect(command('edit', 'pin').label).toBe('Unpin');
    await choose('edit', 'pin');
    await settle(120);
    expect(within(list()).queryByText('Pinned')).not.toBeInTheDocument();
    expect((await savedFile()).pins).toEqual([]);
  });
});

describe('removing', () => {
  it('takes one item out of the list', async () => {
    seedHistory();
    const user = userEvent.setup();
    await mount();
    await user.click(rows()[3] as HTMLElement);
    await choose('edit', 'remove');
    await settle(120);
    expect(rowNames().some((name) => name.includes('first snippet'))).toBe(false);
  });

  it('does not suppress the same text for ever: copying it again brings it back', async () => {
    clipboard().copyText('recurring');
    await mount();
    await choose('edit', 'remove');
    await settle(120);
    expect(screen.queryByRole('list', { name: 'Clipboard items' })).not.toBeInTheDocument();

    await act(async () => {
      clipboard().copyText('recurring');
    });
    expect(rowNames()[0]).toContain('recurring');
  });
});

describe('Clear All', () => {
  it('asks first, and leaves the list alone when the answer is no', async () => {
    seedHistory();
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole('button', { name: 'Clear All' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(rowNames()).toHaveLength(4);
  });

  it('empties the history and keeps the pins', async () => {
    seedHistory();
    const user = userEvent.setup();
    await mount();
    await user.click(rows()[2] as HTMLElement);
    await choose('edit', 'pin');
    await settle(120);

    await user.click(screen.getByRole('button', { name: 'Clear All' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('The pinned item is kept.');
    await user.click(within(dialog).getByRole('button', { name: 'Clear All' }));
    await settle(120);

    expect(rowNames()).toHaveLength(1);
    expect(rowNames()[0]).toContain('SELECT * FROM users');
    await waitFor(async () => {
      expect((await savedFile()).clearedBefore).toBeGreaterThan(0);
    });
  });
});

describe('searching', () => {
  it('keeps the items that hold the words, text or path', async () => {
    seedHistory();
    const user = userEvent.setup();
    await mount();
    const field = screen.getByRole('searchbox', { name: 'Search clipboard items' });
    await user.type(field, 'report');
    expect(rowNames()).toHaveLength(1);
    expect(rowNames()[0]).toContain('report.pdf');
    await user.clear(field);
    await user.type(field, 'nothing here');
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });
});

describe('an empty history', () => {
  it('says once what the app cannot see', async () => {
    await mount();
    expect(screen.getByText('Nothing copied yet')).toBeInTheDocument();
    expect(
      screen.getByText(/cannot read what you copy in another application/),
    ).toBeInTheDocument();
  });

  it('leaves the window controls their gutter in the toolbar', async () => {
    await mount();
    expect(screen.getByRole('toolbar').className).toContain('ps-(--lumen-window-controls-w)');
  });
});
