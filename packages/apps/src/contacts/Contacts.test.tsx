/**
 * The Contacts window. These exercise the shell — the panes, the editor, the
 * menus and what reaches the file — rather than the vCard grammar or the
 * sorting, which have their own tests next door.
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
import Contacts from './Contacts';
import type { ContactsData } from './contact';
import definition from './index';
import { parseVcards } from './vcard';

const Dummy = () => null;

/**
 * happy-dom reports every element as zero-sized and its ResizeObserver is a
 * stub, so the window would measure as too narrow for anything. This one
 * reports a real box, which is what a browser does on first observation.
 */
function sizedObserver(width: number, height: number) {
  return class SizedResizeObserver {
    private readonly callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      const entry = {
        target,
        contentRect: { width, height, x: 0, y: 0, top: 0, left: 0, right: width, bottom: height },
      } as unknown as ResizeObserverEntry;
      this.callback([entry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const originalObserver = globalThis.ResizeObserver;
const NOW = new Date('2026-09-05T10:30:00Z');

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

/** Past the 250 ms write debounce, so the store file is on disk. */
async function flush() {
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  await settle();
}

async function mount(args: Record<string, unknown> = {}) {
  const process = kernel.launch('lumen.contacts', args);
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.contacts', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Contacts pid={process.pid} windowId={windowId} args={args} />
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

/** The window's own top row: with an inset title bar it is the title bar. */
function topRow(): HTMLElement {
  const [row] = screen.getAllByRole('toolbar');
  if (!row) throw new Error('the window has no toolbar');
  return row;
}

const dataPath = () => join(home, '.config', 'contacts.json');
const saved = () => kernel.vfs.readJson<ContactsData>(dataPath());
const list = () => screen.getByRole('list', { name: 'Contacts' });
const card = () => screen.getByRole('region', { name: 'Contact card' });
const rows = () => within(list()).getAllByRole('button');

/** Fill the editor and save. */
async function addContact(
  user: ReturnType<typeof userEvent.setup>,
  given: string,
  family = '',
  extra?: (u: ReturnType<typeof userEvent.setup>) => Promise<void>,
) {
  await choose('file', 'new');
  await user.type(screen.getByLabelText('First name'), given);
  if (family) await user.type(screen.getByLabelText('Last name'), family);
  await extra?.(user);
  await act(async () => {
    await user.click(screen.getByRole('button', { name: 'Save' }));
  });
  await settle();
}

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
  globalThis.ResizeObserver = sizedObserver(900, 640);
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalObserver;
  vi.useRealTimers();
});

describe('the app definition', () => {
  it('is the address book the shell expects', () => {
    expect(definition.id).toBe('lumen.contacts');
    expect(definition.name).toBe('Contacts');
    expect(definition.category).toBe('office');
    expect(definition.singleton).toBe(true);
    expect(definition.window).toMatchObject({ width: 900, height: 640, minWidth: 380 });
  });

  it('opens vCards', () => {
    expect(definition.fileAssociations).toEqual([
      { extensions: ['.vcf'], role: 'editor', priority: 1 },
    ]);
  });
});

describe('the inset title bar', () => {
  it('asks for no title bar band of its own', () => {
    expect(definition.window?.titleBar).toBe('inset');
  });

  it('leaves the window controls their place and names the window', async () => {
    await mount();
    expect(topRow().className).toContain('ps-(--lumen-window-controls-w)');
    expect(within(topRow()).getByText('Contacts')).toBeInTheDocument();
  });

  it('still names the window on the narrowest one it opens at', async () => {
    globalThis.ResizeObserver = sizedObserver(380, 320);
    await mount();
    expect(within(topRow()).getByText('Contacts')).toBeInTheDocument();
    expect(
      within(topRow()).getByRole('searchbox', { name: 'Search contacts' }),
    ).toBeInTheDocument();
  });
});

describe('the first run', () => {
  it('makes a card for the signed-in user', async () => {
    await mount();
    await flush();
    expect(within(list()).getByText('Ada Lovelace')).toBeInTheDocument();
    const data = await saved();
    expect(data.contacts).toHaveLength(1);
    expect(data.prefs.meId).toBe(data.contacts[0]?.id);
  });

  it('marks that card as the user', async () => {
    await mount();
    await flush();
    expect(within(list()).getByText('Me')).toBeInTheDocument();
  });

  it('leaves a book the user has emptied empty', async () => {
    await kernel.vfs.writeJson(
      dataPath(),
      { version: 1, contacts: [], prefs: {} },
      { recursive: true },
    );
    await mount();
    await flush();
    expect(screen.getByText('No contacts yet')).toBeInTheDocument();
    expect((await saved()).contacts).toEqual([]);
  });
});

describe('making a contact', () => {
  it('adds it to the list and to the file', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await addContact(user, 'Grace', 'Hopper');
    expect(within(list()).getByText('Grace Hopper')).toBeInTheDocument();
    await flush();
    const data = await saved();
    expect(data.contacts.map((c) => c.given)).toContain('Grace');
  });

  it('keeps what was typed into the repeating fields', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await addContact(user, 'Grace', 'Hopper', async (u) => {
      await u.click(screen.getByRole('button', { name: 'Add phone' }));
      await u.type(screen.getByLabelText('Phone 1'), '+1 555 0143');
    });
    await flush();
    const grace = (await saved()).contacts.find((c) => c.given === 'Grace');
    expect(grace?.phones).toEqual([{ label: 'mobile', value: '+1 555 0143' }]);
  });

  it('drops a row that was added and left blank', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await addContact(user, 'Grace', 'Hopper', async (u) => {
      await u.click(screen.getByRole('button', { name: 'Add email' }));
    });
    await flush();
    expect((await saved()).contacts.find((c) => c.given === 'Grace')?.emails).toEqual([]);
  });
});

describe('editing a contact', () => {
  it('writes the change on Save', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await flush();
    await act(async () => {
      await user.click(within(list()).getByText('Ada Lovelace'));
    });
    await choose('edit', 'edit-contact');
    await user.type(screen.getByLabelText('Company'), 'Analytical Engine');
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save' }));
    });
    await flush();
    expect(within(card()).getByText('Analytical Engine')).toBeInTheDocument();
    expect((await saved()).contacts[0]?.organisation).toBe('Analytical Engine');
  });

  it('throws the change away on Cancel', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await flush();
    await act(async () => {
      await user.click(within(list()).getByText('Ada Lovelace'));
    });
    await choose('edit', 'edit-contact');
    await user.type(screen.getByLabelText('Company'), 'Nope');
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
    });
    await flush();
    expect((await saved()).contacts[0]?.organisation).toBe('');
  });

  it('is not editable until asked, so the card cannot change while it is read', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await flush();
    await act(async () => {
      await user.click(within(list()).getByText('Ada Lovelace'));
    });
    expect(screen.queryByLabelText('Company')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
  });
});

describe('deleting a contact', () => {
  it('asks first, then removes it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await flush();
    await act(async () => {
      await user.click(within(list()).getByText('Ada Lovelace'));
    });
    await choose('edit', 'delete');
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Delete' }));
    });
    await flush();
    expect((await saved()).contacts).toEqual([]);
  });
});

describe('searching', () => {
  it('narrows the list and says so', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await addContact(user, 'Grace', 'Hopper');
    await user.type(screen.getByLabelText('Search contacts'), 'hopper');
    await settle();
    expect(rows()).toHaveLength(1);
    expect(screen.getByText('1 of 2 contacts')).toBeInTheDocument();
  });

  it('finds a number with the punctuation ignored', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await addContact(user, 'Grace', 'Hopper', async (u) => {
      await u.click(screen.getByRole('button', { name: 'Add phone' }));
      await u.type(screen.getByLabelText('Phone 1'), '+1 (555) 0143');
    });
    await user.type(screen.getByLabelText('Search contacts'), '5550143');
    await settle();
    expect(rows()).toHaveLength(1);
    expect(within(list()).getByText('in phone')).toBeInTheDocument();
  });

  it('says when nothing matches', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await user.type(screen.getByLabelText('Search contacts'), 'zzz');
    await settle();
    expect(screen.getByText('No contacts match')).toBeInTheDocument();
  });
});

describe('the view menu', () => {
  it('sorts by last name', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await addContact(user, 'Grace', 'Hopper');
    expect(
      within(list())
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['A', 'G']);
    await choose('view', 'sort-last');
    expect(
      within(list())
        .getAllByRole('heading')
        .map((h) => h.textContent),
    ).toEqual(['H', 'L']);
  });

  it('hides the groups sidebar', async () => {
    await mount();
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeInTheDocument();
    await choose('view', 'groups');
    expect(screen.queryByRole('navigation', { name: 'Sidebar' })).not.toBeInTheDocument();
  });

  it('remembers the sort between launches', async () => {
    await mount();
    await choose('view', 'sort-last');
    await flush();
    expect((await saved()).prefs.sort).toBe('last');
  });
});

describe('groups', () => {
  it('filters the list to one group', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await addContact(user, 'Grace', 'Hopper', async (u) => {
      await u.type(screen.getByLabelText('Groups'), 'Navy');
    });
    const sidebar = screen.getByRole('navigation', { name: 'Sidebar' });
    await act(async () => {
      await user.click(within(sidebar).getByText('Navy'));
    });
    expect(rows()).toHaveLength(1);
    expect(within(list()).getByText('Grace Hopper')).toBeInTheDocument();
  });
});

describe('importing a vCard', () => {
  const card = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    'N:Hopper;Grace;;;',
    'FN:Grace Hopper',
    'TEL;TYPE=WORK:+1 555 0143',
    'UID:grace-1',
    'END:VCARD',
    '',
  ].join('\r\n');

  it('reads the file it was launched with', async () => {
    const path = join(home, 'Documents', 'grace.vcf');
    await kernel.vfs.writeText(path, card, { recursive: true });
    await mount({ path });
    await settle();
    expect(within(list()).getByText('Grace Hopper')).toBeInTheDocument();
    await flush();
    const data = await saved();
    expect(data.contacts.find((c) => c.id === 'grace-1')?.phones).toEqual([
      { label: 'work', value: '+1 555 0143' },
    ]);
  });

  it('replaces a card it already had rather than repeating it', async () => {
    const first = join(home, 'Documents', 'grace.vcf');
    const second = join(home, 'Documents', 'grace-again.vcf');
    await kernel.vfs.writeText(first, card, { recursive: true });
    await kernel.vfs.writeText(second, card.replace('+1 555 0143', '+1 555 0199'), {
      recursive: true,
    });
    await mount({ path: first });
    await flush();

    // The window is a singleton, so a second open arrives as new arguments.
    await act(async () => {
      kernel.launch('lumen.contacts', { path: second });
    });
    await settle();
    await flush();

    const grace = (await saved()).contacts.filter((c) => c.id === 'grace-1');
    expect(grace).toHaveLength(1);
    expect(grace[0]?.phones).toEqual([{ label: 'work', value: '+1 555 0199' }]);
    expect(within(list()).queryAllByText(/Grace/)).toHaveLength(1);
  });
});

describe('exporting a vCard', () => {
  it('writes the selected card where the dialog says', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await flush();
    await act(async () => {
      await user.click(within(list()).getByText('Ada Lovelace'));
    });
    await choose('file', 'export');
    const name = screen.getByLabelText('Save as');
    await user.clear(name);
    await user.type(name, 'ada.vcf');
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save' }));
    });
    await settle();
    const written = await kernel.vfs.readText(join(home, 'Documents', 'ada.vcf'));
    const [parsed] = parseVcards(written, { now: 0 });
    expect(parsed?.given).toBe('Ada');
    expect(parsed?.family).toBe('Lovelace');
  });
});

describe('duplicates', () => {
  it('offers to merge two cards for one person, and does', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await flush();
    await addContact(user, 'Ada', 'Lovelace', async (u) => {
      await u.click(screen.getByRole('button', { name: 'Add email' }));
      await u.type(screen.getByLabelText('Email 1'), 'ada@example.org');
    });
    await choose('edit', 'duplicates');
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/same name/)).toBeInTheDocument();
    await act(async () => {
      await user.click(within(dialog).getByRole('button', { name: 'Merge' }));
    });
    await flush();
    const data = await saved();
    expect(data.contacts).toHaveLength(1);
    expect(data.contacts[0]?.emails).toEqual([{ label: 'home', value: 'ada@example.org' }]);
  });

  it('says so when there are none', async () => {
    await mount();
    await flush();
    await choose('edit', 'duplicates');
    expect(screen.getByText(/No two cards share/)).toBeInTheDocument();
  });
});

describe('a folded window', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = sizedObserver(380, 320);
  });

  it('shows one pane at a time', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await flush();
    expect(screen.queryByRole('navigation', { name: 'Sidebar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Jump to letter' })).not.toBeInTheDocument();

    await act(async () => {
      await user.click(within(list()).getByText('Ada Lovelace'));
    });
    expect(screen.queryByRole('list', { name: 'Contacts' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Ada Lovelace/ })).toBeInTheDocument();

    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Back to list' }));
    });
    expect(screen.getByRole('list', { name: 'Contacts' })).toBeInTheDocument();
  });
});

describe('the A–Z rail', () => {
  it('offers every letter, and only reaches the ones in the book', async () => {
    await mount();
    await flush();
    const rail = screen.getByRole('navigation', { name: 'Jump to letter' });
    const letters = within(rail).getAllByRole('button');
    expect(letters).toHaveLength(27);
    expect(letters.filter((button) => !button.hasAttribute('disabled'))).toHaveLength(1);
  });
});
