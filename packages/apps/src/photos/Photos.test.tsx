/**
 * The Photos window. These exercise what a person would notice — which
 * pictures are listed, what the empty library says, the lightbox, the
 * favourites that reach the account's file, the confirm before the Trash —
 * and the one thing that is invisible until it goes wrong: every object URL
 * a thumbnail creates being given back.
 *
 * The sorting, the grid arithmetic and the settings normalisation have their
 * own tests next door.
 */

import { createKernel, type Kernel, useMenuStore, useWindowStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import definition from './index';
import Photos from './Photos';
import type { PhotosData } from './settings';

const Dummy = () => null;

/** The window width the observer below reports; a test may narrow it. */
let frameWidth = 1100;

/**
 * happy-dom gives every element a zero box and its ResizeObserver is a stub,
 * so the window would measure as too narrow for the album list and the grid
 * would keep only its overscan rows. This one reports a real window, which is
 * what a browser does on the first observation.
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
        width: frameWidth,
        height: 680,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        bottom: 680,
        right: frameWidth,
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
let pictures: string;
let windowId: string;
let createUrl: MockInstance<(object: Blob | MediaSource) => string>;
let revokeUrl: MockInstance<(url: string) => void>;

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 6; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

/** Past the 250 ms write debounce, so the photos file is on disk. */
async function flush() {
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  await settle();
}

async function mount() {
  const process = kernel.launch('lumen.photos', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.photos', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Photos pid={process.pid} windowId={windowId} args={{}} />
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

/**
 * The pictures on screen, in the order the grid draws them. Scoped to the
 * grid: the toolbar's selects are listboxes with options of their own.
 */
function tiles(): string[] {
  const grid = screen.queryByRole('listbox', { name: 'Pictures' });
  if (!grid) return [];
  return within(grid)
    .queryAllByRole('option')
    .map((el) => el.getAttribute('data-path') ?? '')
    .map((path) => path.slice(path.lastIndexOf('/') + 1));
}

/** The tiles themselves, for the assertions that look at one. */
function tileElements(): HTMLElement[] {
  const grid = screen.queryByRole('listbox', { name: 'Pictures' });
  return grid ? within(grid).queryAllByRole('option') : [];
}

/** Report the pixels an image would have decoded to; happy-dom decodes none. */
async function decode(image: HTMLElement, width: number, height: number) {
  Object.defineProperty(image, 'naturalWidth', { value: width, configurable: true });
  Object.defineProperty(image, 'naturalHeight', { value: height, configurable: true });
  await act(async () => {
    fireEvent.load(image);
  });
  await settle();
}

const dataPath = () => join(home, '.config', 'photos.json');

beforeEach(async () => {
  frameWidth = 1100;
  vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-09-04T10:30:00Z') });
  globalThis.ResizeObserver = SizedResizeObserver as unknown as typeof ResizeObserver;
  // The grid asks the scroll port how tall it is; happy-dom would say zero.
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => 680,
  });
  createUrl = vi.spyOn(URL, 'createObjectURL');
  revokeUrl = vi.spyOn(URL, 'revokeObjectURL');

  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [
      { ...definition, component: Dummy },
      {
        id: 'lumen.files',
        name: 'Files',
        description: 'Browse files',
        category: 'system',
        icon: Dummy,
        component: Dummy,
        window: { width: 600, height: 400 },
      },
    ],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  home = kernel.home;
  pictures = join(home, 'Pictures');
  await kernel.vfs.writeFile(join(pictures, 'anchor.png'), PNG, { recursive: true });
  await kernel.vfs.writeFile(join(pictures, 'beach.jpg'), new Uint8Array(40));
  await kernel.vfs.writeText(join(pictures, 'notes.txt'), 'not a picture');
  await kernel.vfs.writeFile(join(pictures, 'Trips', 'oslo.png'), new Uint8Array(200), {
    recursive: true,
  });
  await kernel.vfs.writeFile(join(pictures, 'Trips', 'fjord.webp'), new Uint8Array(9));
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalObserver;
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
  vi.useRealTimers();
  useWindowStore.setState({ windows: {}, order: [], focusedId: null });
  kernel.dispose();
});

describe('the app definition', () => {
  it('is the app the shell expects', () => {
    expect(definition.id).toBe('lumen.photos');
    expect(definition.name).toBe('Photos');
    expect(definition.category).toBe('media');
    expect(definition.singleton).toBe(true);
    expect(definition.keywords).toContain('pictures');
  });

  it('claims a window small enough to be honest about it', () => {
    expect(definition.window.minWidth).toBeLessThanOrEqual(360);
    expect(definition.window.minHeight).toBeLessThanOrEqual(320);
    expect(definition.window.titleBar).toBe('inset');
  });
});

describe('the library', () => {
  it('lists every picture under Pictures, at any depth, and nothing else', async () => {
    await mount();
    expect(tiles().sort()).toEqual(['anchor.png', 'beach.jpg', 'fjord.webp', 'oslo.png']);
    expect(tiles()).not.toContain('notes.txt');
  });

  it('counts what it is showing', async () => {
    await mount();
    expect(screen.getByText('4 pictures')).toBeInTheDocument();
  });

  it('picks up a picture added to the folder while it is open', async () => {
    await mount();
    await act(async () => {
      await kernel.vfs.writeFile(join(pictures, 'later.png'), PNG);
    });
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    await settle();
    expect(tiles()).toContain('later.png');
  });

  it('says where pictures go rather than spinning for ever', async () => {
    for (const name of ['anchor.png', 'beach.jpg']) {
      await kernel.vfs.remove(join(pictures, name));
    }
    await kernel.vfs.remove(join(pictures, 'Trips'), { recursive: true });
    await mount();
    expect(screen.getByText('No pictures yet')).toBeInTheDocument();
    expect(screen.getByText(new RegExp(pictures))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Pictures in Files' })).toBeInTheDocument();
  });

  it('says plainly when the account has no Pictures folder at all', async () => {
    await kernel.vfs.remove(pictures, { recursive: true });
    await mount();
    expect(screen.getByText('No Pictures folder')).toBeInTheDocument();
  });
});

describe('choosing what to show', () => {
  it('narrows by file name, and offers to clear the search', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await user.type(screen.getByRole('searchbox', { name: 'Search picture names' }), 'os');
    await settle();
    expect(tiles()).toEqual(['oslo.png']);

    await user.type(screen.getByRole('searchbox', { name: 'Search picture names' }), 'zzz');
    await settle();
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Clear search' }));
    });
    await settle();
    expect(tiles()).toHaveLength(4);
  });

  it('makes an album of every folder that holds a picture', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    const sidebar = screen.getByRole('navigation');
    await act(async () => {
      await user.click(within(sidebar).getByRole('button', { name: /^Trips/ }));
    });
    await settle();
    expect(tiles().sort()).toEqual(['fjord.webp', 'oslo.png']);
  });

  it('sorts by name and by size', async () => {
    await mount();
    // The same choice is on the toolbar in a window this wide.
    expect(screen.getByRole('combobox', { name: 'Sort by' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Thumbnail size' })).toBeInTheDocument();
    await choose('view', 'sort-name');
    await choose('view', 'ascending');
    expect(tiles()).toEqual(['anchor.png', 'beach.jpg', 'fjord.webp', 'oslo.png']);

    await choose('view', 'sort-size');
    expect(tiles()).toEqual(['anchor.png', 'fjord.webp', 'beach.jpg', 'oslo.png']);

    await choose('view', 'descending');
    expect(tiles()).toEqual(['oslo.png', 'beach.jpg', 'fjord.webp', 'anchor.png']);
  });
});

describe('the cursor and the lightbox', () => {
  it('fills the window with the picture that was clicked, and Escape comes back', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await choose('view', 'sort-name');
    await choose('view', 'ascending');
    await act(async () => {
      await user.click(tileElements()[1] as HTMLElement);
    });
    await settle();

    expect(screen.queryByRole('listbox', { name: 'Pictures' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to Library' })).toBeInTheDocument();
    expect(screen.getByText('2 of 4')).toBeInTheDocument();
    expect(useWindowStore.getState().windows[windowId]?.title).toBe('beach.jpg');

    await act(async () => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    await settle();
    expect(screen.getByRole('listbox', { name: 'Pictures' })).toBeInTheDocument();
  });

  it('steps through the pictures with the arrow keys while one fills the window', async () => {
    await mount();
    await choose('view', 'sort-name');
    await choose('view', 'ascending');
    await choose('picture', 'lightbox');
    expect(screen.getByText('1 of 4')).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    await settle();
    expect(screen.getByText('2 of 4')).toBeInTheDocument();
    expect(useWindowStore.getState().windows[windowId]?.title).toBe('beach.jpg');
  });

  it('moves the cursor around the grid with the arrow keys', async () => {
    await mount();
    await choose('view', 'sort-name');
    await choose('view', 'ascending');
    const grid = screen.getByRole('listbox', { name: 'Pictures' });
    expect(grid.getAttribute('aria-activedescendant')).toBe('photo-0');

    await act(async () => {
      fireEvent.keyDown(grid, { key: 'ArrowRight' });
    });
    await settle();
    expect(grid.getAttribute('aria-activedescendant')).toBe('photo-1');
    expect(tileElements()[1]).toHaveAttribute('aria-selected', 'true');

    await act(async () => {
      fireEvent.keyDown(grid, { key: 'End' });
    });
    await settle();
    expect(grid.getAttribute('aria-activedescendant')).toBe('photo-3');
  });
});

describe('favourites', () => {
  it('writes the marked picture to the account file and collects them in one album', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await choose('view', 'sort-name');
    await choose('view', 'ascending');
    await choose('picture', 'favourite');
    await flush();

    const saved = await kernel.vfs.readJson<PhotosData>(dataPath());
    expect(saved.favourites).toEqual([join(pictures, 'anchor.png')]);

    const sidebar = screen.getByRole('navigation');
    await act(async () => {
      await user.click(within(sidebar).getByRole('button', { name: /^Favourites/ }));
    });
    await settle();
    expect(tiles()).toEqual(['anchor.png']);
  });

  it('unmarks a picture that was already a favourite', async () => {
    await mount();
    await choose('picture', 'favourite');
    await flush();
    await choose('picture', 'favourite');
    await flush();
    expect((await kernel.vfs.readJson<PhotosData>(dataPath())).favourites).toEqual([]);
  });

  /** An unreadable file means no favourites — the library still opens. */
  it('survives a favourites file it cannot read', async () => {
    await kernel.vfs.writeText(dataPath(), '{"favourites": [', { recursive: true });
    await mount();
    expect(tiles()).toHaveLength(4);
    expect(screen.getByText('0 favourites')).toBeInTheDocument();
  });

  it('takes only the paths it recognises out of a file that is part nonsense', async () => {
    await kernel.vfs.writeText(
      dataPath(),
      JSON.stringify({ favourites: [join(pictures, 'anchor.png'), 42, 'relative.png'] }),
      { recursive: true },
    );
    await mount();
    expect(screen.getByText('1 favourite')).toBeInTheDocument();
  });
});

describe('moving a picture to the Trash', () => {
  it('asks first, and leaves the file alone when the answer is no', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await choose('file', 'trash');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    await settle();
    expect(await kernel.vfs.exists(join(pictures, 'anchor.png'))).toBe(true);
    expect(tiles()).toHaveLength(4);
  });

  it('moves it to the Trash when the answer is yes, and forgets it as a favourite', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await choose('view', 'sort-name');
    await choose('view', 'ascending');
    await choose('picture', 'favourite');
    await flush();

    await choose('file', 'trash');
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Move to Trash' }));
    });
    await settle();
    await flush();

    expect(await kernel.vfs.exists(join(pictures, 'anchor.png'))).toBe(false);
    expect(await kernel.vfs.exists(join(kernel.vfs.trashPath, 'anchor.png'))).toBe(true);
    expect(tiles()).not.toContain('anchor.png');
    expect((await kernel.vfs.readJson<PhotosData>(dataPath())).favourites).toEqual([]);
  });
});

describe('the object URLs behind the thumbnails', () => {
  it('gives back every blob it made when the window closes', async () => {
    const view = await mount();
    expect(createUrl.mock.results.length).toBeGreaterThan(0);
    const made = createUrl.mock.results.map((result) => result.value as string);

    await act(async () => {
      view.unmount();
    });
    const given = new Set(revokeUrl.mock.calls.map(([url]) => url));
    for (const url of made) expect(given.has(url)).toBe(true);
  });

  it('gives a thumbnail its blob back when it scrolls out of the grid', async () => {
    for (let i = 0; i < 120; i += 1) {
      await kernel.vfs.writeFile(join(pictures, `p${String(i).padStart(3, '0')}.png`), PNG);
    }
    await mount();
    await choose('view', 'sort-name');
    await choose('view', 'ascending');

    const grid = screen.getByRole('listbox', { name: 'Pictures' });
    const before = new Set(revokeUrl.mock.calls.map(([url]) => url));
    const first = (tileElements()[0] as HTMLElement).getAttribute('data-path');

    grid.scrollTop = 4000;
    await act(async () => {
      fireEvent.scroll(grid);
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    await settle();

    // The first rows are no longer drawn, and their blobs have gone with them.
    expect(tiles()).not.toContain(String(first).slice(String(first).lastIndexOf('/') + 1));
    const after = revokeUrl.mock.calls.map(([url]) => url).filter((url) => !before.has(url));
    expect(after.length).toBeGreaterThan(0);
  });

  it('holds a screenful of blobs, not the whole library', async () => {
    for (let i = 0; i < 200; i += 1) {
      await kernel.vfs.writeFile(join(pictures, `q${String(i).padStart(3, '0')}.png`), PNG);
    }
    await mount();
    const live = createUrl.mock.calls.length - revokeUrl.mock.calls.length;
    expect(tileElements().length).toBeLessThan(204);
    expect(live).toBeLessThan(204);
  });
});

describe('the facts about one picture', () => {
  it('reports the kind, the bytes and the pixels it measured, and nothing else', async () => {
    await mount();
    await choose('view', 'sort-name');
    await choose('view', 'ascending');
    await choose('view', 'info');
    await settle();

    const panel = screen.getByRole('complementary', { name: 'Picture info' });
    expect(within(panel).getByText('anchor.png')).toBeInTheDocument();
    expect(within(panel).getByText('PNG Image')).toBeInTheDocument();
    expect(within(panel).getByText('8 B')).toBeInTheDocument();
    // Nothing has decoded the picture yet, so there are no pixels to report.
    expect(within(panel).getByText('—')).toBeInTheDocument();

    await decode(within(panel).getByRole('img', { name: 'anchor.png' }), 1600, 900);
    expect(within(panel).getByText('1600 × 900')).toBeInTheDocument();
  });
});

describe('a window at its smallest', () => {
  it('drops the panels and the toolbar controls rather than overflowing', async () => {
    frameWidth = definition.window.minWidth ?? 360;
    await mount();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Sort by' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Thumbnail size' })).not.toBeInTheDocument();
    // What is left is the search and the pictures themselves.
    expect(screen.getByRole('searchbox', { name: 'Search picture names' })).toBeInTheDocument();
    expect(tiles()).toHaveLength(4);
  });

  it('still reaches every command through the menubar', async () => {
    frameWidth = 360;
    await mount();
    expect(useMenuStore.getState().byWindow[windowId]?.map((menu) => menu.label)).toEqual([
      'File',
      'Picture',
      'View',
    ]);
    await choose('view', 'sort-name');
    expect(command('view', 'sort-name').checked).toBe(true);
  });
});

describe('the menu on one picture', () => {
  it('opens under the pointer and offers what applies to that picture', async () => {
    await mount();
    await choose('view', 'sort-name');
    await choose('view', 'ascending');
    await act(async () => {
      fireEvent.contextMenu(tileElements()[2] as HTMLElement, { clientX: 40, clientY: 60 });
    });
    await settle();

    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('View Full Window')).toBeInTheDocument();
    expect(within(menu).getByText('Reveal in Files')).toBeInTheDocument();
    expect(within(menu).getByText('Move to Trash…')).toBeInTheDocument();
    // The right-click moved the cursor to the picture it landed on.
    expect(tileElements()[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('answers the Menu key as well as the pointer', async () => {
    await mount();
    const grid = screen.getByRole('listbox', { name: 'Pictures' });
    await act(async () => {
      fireEvent.keyDown(grid, { key: 'F10', shiftKey: true });
    });
    await settle();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});

describe('a picture filling a small window', () => {
  it('keeps the zoom, which has nowhere else to live, and drops the rest', async () => {
    frameWidth = 360;
    await mount();
    await choose('picture', 'lightbox');
    await settle();

    expect(screen.getByRole('button', { name: 'Back to Library' })).toBeInTheDocument();
    // The zoom controls appear once the picture has been measured: there is
    // no honest scale to show before that.
    expect(screen.queryByRole('button', { name: 'Fit to Window' })).not.toBeInTheDocument();
    await decode(screen.getByRole('img', { name: 'anchor.png' }), 1600, 900);
    expect(screen.getByRole('button', { name: 'Fit to Window' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Favourite' })).toBeInTheDocument();
    // Previous and Next are on the menubar and on the arrow keys.
    expect(screen.queryByRole('button', { name: 'Next' })).not.toBeInTheDocument();
    expect(command('picture', 'next').enabled).toBe(true);
  });
});

describe('the zoom in the lightbox', () => {
  it('says Fit while the picture follows the window, and the scale once it does not', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await choose('view', 'sort-name');
    await choose('view', 'ascending');
    await choose('picture', 'lightbox');
    await decode(screen.getByRole('img', { name: 'anchor.png' }), 1600, 900);

    const reading = () => screen.getByTitle('Actual Size');
    expect(reading()).toHaveTextContent('Fit');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Zoom In' }));
    });
    await settle();
    expect(reading()).toHaveTextContent(/^\d+%$/);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Fit to Window' }));
    });
    await settle();
    expect(reading()).toHaveTextContent('Fit');
  });
});
