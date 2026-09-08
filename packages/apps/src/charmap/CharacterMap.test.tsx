import {
  createKernel,
  type Kernel,
  useClipboardStore,
  useMenuStore,
  useWindowStore,
} from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { DialogProvider } from '@lumen/ui';
import { join, MemoryAdapter } from '@lumen/vfs';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProvider, FileDialogProvider } from '../_sdk';
import CharacterMap from './CharacterMap';
import definition from './index';
import type { CharmapData } from './storage';

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
  const process = kernel.launch('lumen.charmap', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.charmap', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <CharacterMap pid={process.pid} windowId={windowId} args={{}} />
          </FileDialogProvider>
        </DialogProvider>
      </AppProvider>
    </KernelProvider>,
  );
  await settle();
  return view;
}

const searchField = () =>
  screen.getByRole<HTMLInputElement>('searchbox', { name: 'Search characters' });
const cells = () => screen.getAllByRole('gridcell');
const cell = (name: string | RegExp) => screen.getByRole('gridcell', { name });
const clipboard = () => useClipboardStore.getState().item;
const details = () => screen.getByLabelText('Character details');

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

const settingsPath = () => join(home, '.config', 'charmap.json');
const saved = () => kernel.vfs.readJson<CharmapData>(settingsPath());

/** Narrow the window so the layout has to fold. */
async function resize(width: number, height: number) {
  await act(async () => {
    useWindowStore.getState().setBounds(windowId, { x: 0, y: 0, width, height });
  });
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
  useClipboardStore.getState().clear();
});

describe('the app definition', () => {
  it('is the map the shell expects', () => {
    expect(definition.id).toBe('lumen.charmap');
    expect(definition.name).toBe('Character Map');
    expect(definition.category).toBe('utilities');
    expect(definition.singleton).toBe(true);
    expect(definition.window).toEqual({
      width: 900,
      height: 620,
      minWidth: 380,
      minHeight: 340,
      titleBar: 'inset',
    });
    expect(definition.keywords).toContain('unicode');
  });
});

describe('opening the window', () => {
  it('starts on General Punctuation and says what the block holds', async () => {
    await mount();
    expect(useWindowStore.getState().windows[windowId]?.title).toBe(
      'Character Map — General Punctuation',
    );
    expect(
      screen.getByText('U+2000–U+206F · 111 of 112 code points have a character'),
    ).toBeInTheDocument();
  });

  it('draws characters from the block, named by code point', async () => {
    await mount();
    expect(cell('U+2000')).toBeInTheDocument();
  });

  it('offers the blocks and the two lists in the sidebar', async () => {
    await mount();
    expect(screen.getByRole('button', { name: 'Pinned' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recent' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Box Drawing' })).toBeInTheDocument();
  });
});

describe('searching', () => {
  it('finds a character by U+ notation', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), 'U+2014');
    expect(cells()).toHaveLength(1);
    expect(cell('U+2014 EM DASH')).toBeInTheDocument();
    expect(screen.getByText('1 result')).toBeInTheDocument();
  });

  it('reads a bare number as hex and as decimal', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), '8212');
    expect(screen.getByText('2 results')).toBeInTheDocument();
    expect(cell('U+2014 EM DASH')).toBeInTheDocument();
  });

  it('finds a character that was pasted in', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), '€');
    expect(cell('U+20AC EURO SIGN')).toBeInTheDocument();
  });

  it('finds a character by a name this app can state', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), 'em dash');
    expect(cell('U+2014 EM DASH')).toBeInTheDocument();
  });

  it('says so plainly when there is nothing', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), 'U+0009');
    expect(screen.getByText('No character found')).toBeInTheDocument();
    expect(screen.getByText(/Search by code point/)).toBeInTheDocument();
    expect(screen.getByText('No results')).toBeInTheDocument();
    expect(within(details()).getByText('No character to show.')).toBeInTheDocument();
  });
});

describe('the details', () => {
  it('shows what can be derived, and the entity it can vouch for', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), 'U+2014');
    expect(screen.getByText('EM DASH')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy UTF-8, E2 80 94' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy HTML named, &mdash;' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy CSS, \\002014' })).toBeInTheDocument();
  });

  it('shows no name where it has none, rather than a guess', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), 'U+4E00');
    const pane = within(details());
    expect(pane.getByText('U+4E00')).toBeInTheDocument();
    expect(pane.getByText('CJK Unified Ideographs')).toBeInTheDocument();
    expect(pane.queryByRole('button', { name: /Copy HTML named/ })).not.toBeInTheDocument();
  });

  it('copies the value that is on screen', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), 'U+2014');
    await user.click(screen.getByRole('button', { name: 'Copy HTML, &#8212;' }));
    expect(clipboard()).toMatchObject({ kind: 'text', text: '&#8212;' });
  });
});

describe('copying a character', () => {
  it('puts the character itself on the clipboard when its cell is clicked', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), 'U+2014');
    await user.click(cell('U+2014 EM DASH'));
    expect(clipboard()).toMatchObject({ kind: 'text', text: '—' });
    expect(screen.getByText('U+2014 copied')).toBeInTheDocument();
  });

  it('keeps it in Recents, for next time', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), 'U+2014');
    await user.click(cell('U+2014 EM DASH'));
    await waitFor(async () => expect((await saved()).recents).toEqual([0x2014]));
  });

  it('lists what was copied under Recent', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), 'U+2014');
    await user.click(cell('U+2014 EM DASH'));
    await user.clear(searchField());
    await user.click(screen.getByRole('button', { name: /^Recent/ }));
    expect(screen.getByText('1 copied recently')).toBeInTheDocument();
    expect(cell('U+2014 EM DASH')).toBeInTheDocument();
  });
});

describe('the keyboard', () => {
  it('moves the cursor with the arrows and copies with Enter', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(cell('U+2000'));
    await user.keyboard('{ArrowRight}');
    expect(cell('U+2001')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    expect(clipboard()).toMatchObject({ kind: 'text', text: ' ' });
  });

  it('stays on the character when the list moves under it', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), 'U+2014');
    await user.click(cell('U+2014 EM DASH'));
    await user.clear(searchField());
    await user.type(searchField(), 'U+00A9');
    await user.click(cell('U+00A9 COPYRIGHT SIGN'));
    await user.clear(searchField());
    await user.click(screen.getByRole('button', { name: /^Recent/ }));
    // Newest first, so the copyright sign leads and the em dash follows.
    await user.click(cell('U+2014 EM DASH'));
    // Copying it moved it to the front; the cursor went with it.
    expect(cell('U+2014 EM DASH')).toHaveAttribute('aria-selected', 'true');
    expect(cells()[0]).toHaveAccessibleName('U+2014 EM DASH');
  });

  it('goes from the search field to the results on Enter', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), 'U+2014{Enter}');
    expect(cell('U+2014 EM DASH')).toHaveFocus();
  });

  it('hands a typed character to the search field', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(cell('U+2000'));
    await user.keyboard('x');
    expect(searchField()).toHaveValue('x');
    expect(searchField()).toHaveFocus();
  });
});

describe('pinning', () => {
  it('pins the character under the cursor and keeps it', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), 'U+2014');
    await user.click(screen.getByRole('button', { name: 'Pin character' }));
    expect(screen.getByRole('button', { name: 'Unpin character' })).toBeInTheDocument();
    await waitFor(async () => expect((await saved()).pinned).toEqual([0x2014]));
  });

  it('shows the pinned characters on their own', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), 'U+2014');
    await user.click(screen.getByRole('button', { name: 'Pin character' }));
    await user.clear(searchField());
    await user.click(screen.getByRole('button', { name: /^Pinned/ }));
    expect(screen.getByText('1 pinned')).toBeInTheDocument();
    expect(cell('U+2014 EM DASH')).toBeInTheDocument();
  });

  it('says nothing is pinned when nothing is', async () => {
    const user = userEvent.setup();
    await mount();
    await user.click(screen.getByRole('button', { name: 'Pinned' }));
    expect(screen.getByText('No pinned characters')).toBeInTheDocument();
    expect(screen.getByText('Nothing pinned')).toBeInTheDocument();
  });
});

describe('the menus', () => {
  it('copies the code point rather than the character', async () => {
    const user = userEvent.setup();
    await mount();
    await user.type(searchField(), 'U+2014');
    await choose('edit', 'copy-code-point');
    expect(clipboard()).toMatchObject({ kind: 'text', text: 'U+2014' });
  });

  it('steps between blocks', async () => {
    await mount();
    await choose('go', 'next-block');
    expect(useWindowStore.getState().windows[windowId]?.title).toBe(
      'Character Map — Superscripts and Subscripts',
    );
    await choose('go', 'previous-block');
    expect(useWindowStore.getState().windows[windowId]?.title).toBe(
      'Character Map — General Punctuation',
    );
  });

  it('clears the recents, and only when there are some', async () => {
    const user = userEvent.setup();
    await mount();
    expect(command('edit', 'clear-recents').enabled).toBe(false);
    await user.type(searchField(), 'U+2014');
    await user.click(cell('U+2014 EM DASH'));
    expect(command('edit', 'clear-recents').enabled).toBe(true);
    await choose('edit', 'clear-recents');
    await waitFor(async () => expect((await saved()).recents).toEqual([]));
  });

  it('puts the sidebar away and remembers that', async () => {
    await mount();
    expect(screen.getByRole('button', { name: 'Box Drawing' })).toBeInTheDocument();
    await choose('view', 'sidebar');
    expect(screen.queryByRole('button', { name: 'Box Drawing' })).not.toBeInTheDocument();
    await waitFor(async () => expect((await saved()).showSidebar).toBe(false));
  });
});

describe('a narrow window', () => {
  it('swaps the sidebar for a select', async () => {
    await mount();
    await resize(380, 340);
    expect(screen.queryByRole('button', { name: 'Box Drawing' })).not.toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: 'Block' });
    expect(select).toHaveValue('general-punctuation');
  });

  it('still shows the details, as a strip under the grid', async () => {
    const user = userEvent.setup();
    await mount();
    await resize(380, 340);
    await user.type(searchField(), 'U+2014');
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(screen.getByLabelText('Character details')).toBeInTheDocument();
  });
});

describe('a settings file left by an earlier session', () => {
  it('is read back', async () => {
    const data: CharmapData = {
      source: 'box-drawing',
      recents: [0x2014],
      pinned: [0x00a9],
      showSidebar: true,
    };
    await kernel.vfs.writeJson(settingsPath(), data, { recursive: true });
    await mount();
    expect(useWindowStore.getState().windows[windowId]?.title).toBe('Character Map — Box Drawing');
    expect(screen.getByText('U+2500–U+257F · 128 characters')).toBeInTheDocument();
  });

  it('is not trusted: a code point with nothing to draw is dropped', async () => {
    await kernel.vfs.writeJson(
      settingsPath(),
      { source: 'nonesuch', pinned: [0xd800, 0x2014] },
      { recursive: true },
    );
    await mount();
    expect(useWindowStore.getState().windows[windowId]?.title).toBe(
      'Character Map — General Punctuation',
    );
    await act(async () => {
      command('go', 'go-pinned').onSelect?.();
    });
    expect(screen.getByText('1 pinned')).toBeInTheDocument();
  });
});
