/**
 * The frame is the only thing in this app that touches the network, and a
 * cross-origin page is unreadable anyway, so the environment is told not to
 * fetch iframe documents.
 *
 * @vitest-environment happy-dom
 * @vitest-environment-options { "settings": { "navigation": { "disableChildFrameNavigation": true } } }
 */
import { createKernel, type Kernel, useMenuStore, useWindowStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import Browser from './Browser';
import { type BrowserData, DEFAULT_BOOKMARKS } from './data';
import definition from './index';

const Dummy = () => null;

/**
 * Match an accessible name that contains this text.
 *
 * Written as a predicate rather than as a bare regular expression on purpose.
 * `/example\.com/` is indistinguishable, to a reader and to a static analyser
 * alike, from a hostname check that forgot its anchors and would therefore
 * accept `evil-example.com`. Nothing here checks a host — these assert what a
 * tab or a row is called — and saying so plainly costs one function.
 */
const named = (text: string) => (name: string) => name.includes(text);

let kernel: Kernel;
let home: string;

function mount(args: { url?: string } = {}) {
  const process = kernel.launch('lumen.browser', args);
  if (!process) throw new Error('failed to launch');
  const windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.browser', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Browser pid={process.pid} windowId={windowId} args={args} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  return { ...view, windowId, pid: process.pid };
}

const address = () => screen.getByRole('combobox', { name: 'Address and search' });
const dataFile = () => join(home, '.config', 'browser.json');

function command(windowId: string, menu: string, id: string) {
  const item = useMenuStore
    .getState()
    .byWindow[windowId]?.find((m) => m.id === menu)
    ?.items.find((i) => i.id === id);
  if (!item) throw new Error(`no ${menu} > ${id}`);
  return item;
}

/** Type an address into the bar and press Enter. */
async function goTo(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(address());
  await user.keyboard(`${text}{Enter}`);
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

afterEach(cleanup);

describe('the window', () => {
  it('opens one tab on the new-tab page', async () => {
    const { windowId } = mount();
    expect(screen.getAllByRole('tab')).toHaveLength(1);
    expect(screen.getByRole('tab')).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(useWindowStore.getState().windows[windowId]?.title).toBe('New Tab'));
    expect(screen.getByRole('heading', { name: 'Bookmarks' })).toBeInTheDocument();
  });

  it('contributes File, History, Bookmarks and View', async () => {
    const { windowId } = mount();
    await waitFor(() =>
      expect(useMenuStore.getState().byWindow[windowId]?.map((m) => m.label)).toEqual([
        'File',
        'History',
        'Bookmarks',
        'View',
      ]),
    );
  });

  it('opens the address it was launched with', async () => {
    mount({ url: 'https://example.com/docs' });
    expect(screen.getByRole('tab', { name: named('example.com') })).toBeInTheDocument();
  });
});

describe('the address bar', () => {
  it('is a combobox that names its highlighted row', async () => {
    const user = userEvent.setup();
    mount();
    const bar = address();
    expect(bar).toHaveAttribute('aria-expanded', 'false');

    await user.click(bar);
    await user.keyboard('example.com');

    await waitFor(() => expect(bar).toHaveAttribute('aria-expanded', 'true'));
    const list = screen.getByRole('listbox', { name: 'Suggestions' });
    expect(bar).toHaveAttribute('aria-controls', list.id);
    const active = bar.getAttribute('aria-activedescendant');
    expect(active).toBeTruthy();
    expect(within(list).getByRole('option', { selected: true }).id).toBe(active);
  });

  it('goes to a typed address and names the tab after the host', async () => {
    const user = userEvent.setup();
    const { windowId } = mount();
    await goTo(user, 'example.com/docs');

    expect(screen.getByRole('tab', { name: named('example.com') })).toBeInTheDocument();
    await waitFor(() =>
      expect(useWindowStore.getState().windows[windowId]?.title).toBe('example.com'),
    );
  });

  it('searches for text that is not an address', async () => {
    const user = userEvent.setup();
    mount();
    await goTo(user, 'red pandas');
    expect(screen.getByRole('tab', { name: named('duckduckgo.com') })).toBeInTheDocument();
  });
});

describe('tabs', () => {
  it('opens and closes tabs from the File menu', async () => {
    const { windowId } = mount();
    command(windowId, 'file', 'new-tab').onSelect?.();
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(2));

    command(windowId, 'file', 'close-tab').onSelect?.();
    await waitFor(() => expect(screen.getAllByRole('tab')).toHaveLength(1));
  });

  it('closes the window when the last tab goes', async () => {
    const { windowId } = mount();
    command(windowId, 'file', 'close-tab').onSelect?.();
    await waitFor(() => expect(useWindowStore.getState().windows[windowId]).toBeUndefined());
  });
});

describe('bookmarks', () => {
  it('stars the current page, shows it on the bar and writes it to the home folder', async () => {
    const user = userEvent.setup();
    mount();
    await goTo(user, 'ada.example');

    await user.click(screen.getByRole('button', { name: 'Bookmark this page' }));
    expect(screen.getByRole('button', { name: 'Remove bookmark' })).toBeInTheDocument();

    await waitFor(async () => {
      const stored = await kernel.vfs.readJson<BrowserData>(dataFile());
      expect(stored.bookmarks.map((b) => b.url)).toContain('https://ada.example/');
    });
  });

  it('starts with favourites that can be opened from the bar', async () => {
    const user = userEvent.setup();
    mount();
    const bar = within(screen.getByRole('navigation', { name: 'Bookmarks bar' }));
    for (const bookmark of DEFAULT_BOOKMARKS) {
      expect(bar.getByRole('button', { name: bookmark.title })).toBeInTheDocument();
    }

    await user.click(bar.getByRole('button', { name: 'Example Domain' }));
    expect(screen.getByRole('tab', { name: named('example.com') })).toBeInTheDocument();
  });

  it('shows a built-in page that ships starred as starred', async () => {
    const user = userEvent.setup();
    mount();
    const star = screen.getByRole('button', { name: 'Remove bookmark' });

    await user.click(star);
    expect(screen.getByRole('button', { name: 'Bookmark this page' })).toBeInTheDocument();
  });

  it('lists bookmarks on lumen://bookmarks', async () => {
    const user = userEvent.setup();
    const { windowId } = mount();
    await goTo(user, 'ada.example');
    await user.click(screen.getByRole('button', { name: 'Bookmark this page' }));

    command(windowId, 'bookmarks', 'show-bookmarks').onSelect?.();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Bookmarks', level: 1 })).toBeInTheDocument(),
    );
    expect(screen.getByRole('searchbox', { name: 'Search bookmarks' })).toBeInTheDocument();
  });
});

describe('internal pages', () => {
  it('records a visit and shows it on lumen://history', async () => {
    const user = userEvent.setup();
    const { windowId } = mount();
    await goTo(user, 'example.com/docs');

    command(windowId, 'history', 'show-history').onSelect?.();
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'History', level: 1 })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: named('example.com/docs') })).toBeInTheDocument();
  });

  it('says so when there is no page at a lumen:// address', async () => {
    const user = userEvent.setup();
    mount();
    await goTo(user, 'lumen://nowhere');
    expect(await screen.findByText('No page at this address')).toBeInTheDocument();
  });

  it('offers the homepage and the search engine on lumen://settings', async () => {
    const user = userEvent.setup();
    mount();
    await goTo(user, 'lumen://settings');
    expect(await screen.findByLabelText('Homepage')).toBeInTheDocument();
    expect(screen.getByLabelText('Search engine')).toHaveValue('duckduckgo');
  });

  it('shows nothing at all on lumen://blank', async () => {
    const user = userEvent.setup();
    mount();
    await goTo(user, 'lumen://blank');
    expect(screen.getByRole('tab', { name: named('Blank Page') })).toBeInTheDocument();
    expect(screen.queryByText('No page at this address')).not.toBeInTheDocument();
  });
});

describe('settings', () => {
  const openSettings = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getByRole('button', { name: 'Browser settings' }));
    await screen.findByRole('heading', { name: 'Browser Settings', level: 1 });
  };

  it('opens from the toolbar button and from the File menu', async () => {
    const user = userEvent.setup();
    const { windowId } = mount();
    await openSettings(user);

    await goTo(user, 'lumen://start');
    command(windowId, 'file', 'settings').onSelect?.();
    expect(
      await screen.findByRole('heading', { name: 'Browser Settings', level: 1 }),
    ).toBeInTheDocument();
  });

  it('sends a search to the engine that was chosen', async () => {
    const user = userEvent.setup();
    mount();
    await openSettings(user);
    await user.selectOptions(screen.getByLabelText('Search engine'), 'google');

    await goTo(user, 'red pandas');
    expect(screen.getByRole('tab', { name: named('google.com') })).toBeInTheDocument();
  });

  it('shows the query template of the engine, and keeps a custom one', async () => {
    const user = userEvent.setup();
    mount();
    await openSettings(user);
    expect(screen.getByLabelText('Query template')).toHaveValue('https://duckduckgo.com/?q=%s');

    await user.selectOptions(screen.getByLabelText('Search engine'), 'custom');
    const template = screen.getByLabelText('Query template');
    await user.clear(template);
    await user.type(template, 'https://search.ada.example/?q=%s');
    await user.tab();

    await waitFor(async () => {
      const stored = await kernel.vfs.readJson<BrowserData>(dataFile());
      expect(stored.settings.searchTemplate).toBe('https://search.ada.example/?q=%s');
    });
    await goTo(user, 'red pandas');
    expect(screen.getByRole('tab', { name: named('search.ada.example') })).toBeInTheDocument();
  });

  it('writes the JavaScript switch straight into the frame’s sandbox', async () => {
    const user = userEvent.setup();
    const { windowId } = mount();
    await goTo(user, 'ada.example');
    const frame = () => document.querySelector('iframe');
    expect(frame()).toHaveAttribute('sandbox', 'allow-scripts allow-forms');

    command(windowId, 'file', 'new-tab').onSelect?.();
    await openSettings(user);
    await user.click(screen.getByRole('switch', { name: 'JavaScript' }));

    await waitFor(() => expect(frame()).toHaveAttribute('sandbox', 'allow-forms'));
  });

  it('stops writing history when history is switched off', async () => {
    const user = userEvent.setup();
    mount();
    await openSettings(user);
    await user.click(screen.getByRole('switch', { name: 'Keep history' }));

    await goTo(user, 'ada.example');
    await waitFor(async () => {
      const stored = await kernel.vfs.readJson<BrowserData>(dataFile());
      expect(stored.settings.keepHistory).toBe(false);
    });
    const stored = await kernel.vfs.readJson<BrowserData>(dataFile());
    expect(stored.history).toEqual([]);
  });

  it('writes the bookmarks into the downloads folder', async () => {
    const user = userEvent.setup();
    mount();
    await openSettings(user);
    await user.click(screen.getByRole('button', { name: 'Export' }));

    const path = join(home, 'Downloads', 'bookmarks.json');
    await waitFor(async () => expect(await kernel.vfs.exists(path)).toBe(true));
    const exported = await kernel.vfs.readJson<Array<{ url: string }>>(path);
    expect(exported.map((b) => b.url)).toEqual(DEFAULT_BOOKMARKS.map((b) => b.url));
  });

  it('opens a new tab where the new-tab setting says', async () => {
    const user = userEvent.setup();
    const { windowId } = mount();
    await openSettings(user);
    await user.selectOptions(screen.getByLabelText('New tab opens'), 'blank');

    command(windowId, 'file', 'new-tab').onSelect?.();
    await waitFor(() =>
      expect(screen.getByRole('tab', { name: named('Blank Page') })).toBeInTheDocument(),
    );
  });
});

describe('a site that will not be embedded', () => {
  it('says which header turned it away, without waiting for a timeout', async () => {
    const user = userEvent.setup();
    mount();
    await goTo(user, 'https://www.google.com/');

    expect(await screen.findByText('This site refused to be embedded')).toBeInTheDocument();
    expect(
      screen.getByText(
        'google.com sends X-Frame-Options: SAMEORIGIN, so only google.com may embed its pages.',
      ),
    ).toBeInTheDocument();
    // Nothing was asked of the network: there is no frame to ask with.
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('offers a way out, and a way to make it the default', async () => {
    const user = userEvent.setup();
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    mount();
    await goTo(user, 'https://www.google.com/');

    await user.click(await screen.findByRole('button', { name: 'Open Outside Lumen' }));
    expect(opened).toHaveBeenCalledWith('https://www.google.com/', '_blank', 'noopener,noreferrer');

    await user.click(screen.getByRole('button', { name: 'Always Open Outside' }));
    expect(await screen.findByText('This site opens outside Lumen')).toBeInTheDocument();

    await waitFor(async () => {
      const stored = await kernel.vfs.readJson<BrowserData>(dataFile());
      expect(stored.settings.externalHosts).toEqual(['google.com']);
    });
    opened.mockRestore();
  });

  it('takes a site off the list again from the panel', async () => {
    const user = userEvent.setup();
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    mount();
    await goTo(user, 'https://www.google.com/');
    await user.click(await screen.findByRole('button', { name: 'Always Open Outside' }));

    await user.click(await screen.findByRole('button', { name: 'Stop Opening Outside' }));
    expect(await screen.findByText('This site refused to be embedded')).toBeInTheDocument();
    opened.mockRestore();
  });

  it('hands an address on the list straight to the browser outside', async () => {
    const user = userEvent.setup();
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    mount();
    await goTo(user, 'lumen://settings');
    await user.type(await screen.findByLabelText('Add a site'), 'ada.example');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    await goTo(user, 'https://ada.example/docs');
    expect(opened).toHaveBeenCalledWith(
      'https://ada.example/docs',
      '_blank',
      'noopener,noreferrer',
    );
    expect(await screen.findByText('This site opens outside Lumen')).toBeInTheDocument();
    opened.mockRestore();
  });
});
