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
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import Browser from './Browser';
import type { BrowserData } from './data';
import definition from './index';

const Dummy = () => null;

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
    expect(screen.getByRole('tab', { name: /example\.com/ })).toBeInTheDocument();
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

    expect(screen.getByRole('tab', { name: /example\.com/ })).toBeInTheDocument();
    await waitFor(() =>
      expect(useWindowStore.getState().windows[windowId]?.title).toBe('example.com'),
    );
  });

  it('searches for text that is not an address', async () => {
    const user = userEvent.setup();
    mount();
    await goTo(user, 'red pandas');
    expect(screen.getByRole('tab', { name: /duckduckgo\.com/ })).toBeInTheDocument();
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
    await goTo(user, 'example.com');

    await user.click(screen.getByRole('button', { name: 'Bookmark this page' }));
    expect(screen.getByRole('button', { name: 'Remove bookmark' })).toBeInTheDocument();

    await waitFor(async () => {
      const stored = await kernel.vfs.readJson<BrowserData>(dataFile());
      expect(stored.bookmarks.map((b) => b.url)).toEqual(['https://example.com/']);
    });
  });

  it('cannot bookmark an internal page', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Bookmark this page' })).toBeDisabled();
  });

  it('lists bookmarks on lumen://bookmarks', async () => {
    const user = userEvent.setup();
    const { windowId } = mount();
    await goTo(user, 'example.com');
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
    expect(screen.getByRole('button', { name: /example\.com\/docs/ })).toBeInTheDocument();
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
});
