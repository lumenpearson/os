/**
 * The Reminders window. These exercise the shell — the field at the top, the
 * keyboard on the list, the menus and what reaches the file — rather than the
 * date arithmetic and the reducer, which have their own tests next door.
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
import definition from './index';
import Reminders from './Reminders';
import type { RemindersData } from './store';

const Dummy = () => null;

/** The width the window reports; a few tests narrow it to fold the sidebar. */
let windowWidth = 880;

/**
 * happy-dom gives every element a zero size and its ResizeObserver is a stub,
 * so the window would measure as too narrow for the sidebar. This one reports
 * a real window's box, which is what a browser does on the first observation.
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
        width: windowWidth,
        height: 640,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: windowWidth,
        bottom: 640,
      },
    } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

const originalObserver = globalThis.ResizeObserver;

/** A fixed instant so "today" never moves under the assertions. */
const NOW = new Date('2026-09-04T10:30:00Z');

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

/** Past the 250 ms write debounce, so the file is on disk. */
async function flush() {
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  await settle();
}

async function mount() {
  const process = kernel.launch('lumen.reminders', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider
        value={{ pid: process.pid, windowId, appId: 'lumen.reminders', container: null }}
      >
        <DialogProvider>
          <FileDialogProvider>
            <Reminders pid={process.pid} windowId={windowId} args={{}} />
          </FileDialogProvider>
        </DialogProvider>
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

async function choose(menu: string, id: string) {
  await act(async () => {
    command(menu, id).onSelect?.();
  });
  await settle();
}

const saved = () => kernel.vfs.readJson<RemindersData>(join(home, '.config', 'reminders.json'));

const field = () => screen.getByLabelText('New reminder');
const rowFor = (title: string) => screen.getByRole('option', { name: new RegExp(title) });

/** Type a line into the field and press Enter, as a person would. */
async function add(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.click(field());
  await user.type(field(), `${text}{Enter}`);
  await settle();
}

beforeEach(async () => {
  windowWidth = 880;
  vi.useFakeTimers({ shouldAdvanceTime: true, now: NOW });
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: [{ ...definition, component: Dummy }],
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  home = kernel.home;
  useSettingsStore
    .getState()
    .patch('region', { locale: 'en-GB', timeZone: 'UTC', firstDayOfWeek: 1 });
  useSettingsStore.getState().patch('menubar', { clock24h: true });
  globalThis.ResizeObserver = SizedResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalObserver;
  vi.useRealTimers();
});

describe('the app definition', () => {
  it('is the app the shell expects', () => {
    expect(definition.id).toBe('lumen.reminders');
    expect(definition.name).toBe('Reminders');
    expect(definition.category).toBe('office');
    expect(definition.singleton).toBe(true);
    expect(definition.window).toMatchObject({ width: 880, height: 640, minWidth: 360 });
  });
});

describe('adding a reminder', () => {
  it('adds on Enter, clears the field and keeps the cursor there', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await add(user, 'Buy milk');

    expect(rowFor('Buy milk')).toBeInTheDocument();
    expect(field()).toHaveValue('');
    expect(field()).toHaveFocus();

    await add(user, 'Book train');
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('writes the list to the user home', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await add(user, 'Buy milk');
    await flush();

    const file = await saved();
    expect(file.items).toHaveLength(1);
    expect(file.items[0]).toMatchObject({ title: 'Buy milk', due: '2026-09-04' });
  });

  it('reads a date out of the line and takes it out of the title', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await choose('view', 'smart-all');
    await add(user, 'Call the dentist tomorrow at 9am');
    await flush();

    const file = await saved();
    expect(file.items[0]).toMatchObject({
      title: 'Call the dentist',
      due: '2026-09-05',
      dueTime: 540,
    });
    expect(within(rowFor('Call the dentist')).getByText('Tomorrow 09:00')).toBeInTheDocument();
  });

  it('says what it understood before the reminder is added', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await user.type(field(), 'Bins every week');
    expect(screen.getByText('Today · Every week')).toBeInTheDocument();
  });

  it('ignores an empty line', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await user.click(field());
    await user.type(field(), '   {Enter}');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
  });
});

describe('the keyboard on the list', () => {
  it('moves between rows and ticks one off with Space', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await choose('view', 'smart-all');
    await add(user, 'First');
    await add(user, 'Second');

    await act(async () => rowFor('First').focus());
    await user.keyboard('{ArrowDown}');
    expect(rowFor('Second')).toHaveFocus();

    await user.keyboard(' ');
    await settle();
    // Completed reminders leave the list until Show Completed is on.
    expect(screen.queryByRole('option', { name: /Second/ })).not.toBeInTheDocument();
    await flush();
    expect((await saved()).items.find((i) => i.title === 'Second')?.completed).toBe(true);
  });

  it('steps down from the field into the first row', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await add(user, 'First');
    await add(user, 'Second');
    expect(field()).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    await settle();
    expect(rowFor('First')).toHaveFocus();
  });

  it('makes a subtask with Tab and lifts it out with Shift+Tab', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await add(user, 'Trip');
    await add(user, 'Passport');

    await act(async () => rowFor('Passport').focus());
    await user.keyboard('{Tab}');
    await settle();
    await flush();
    const nested = await saved();
    expect(nested.items[1]).toMatchObject({ title: 'Passport' });
    expect(nested.items[1]?.parentId).toBe(nested.items[0]?.id);

    await user.keyboard('{Shift>}{Tab}{/Shift}');
    await settle();
    await flush();
    expect((await saved()).items[1]?.parentId).toBeNull();
  });

  it('opens the details of the focused reminder with Enter', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await add(user, 'Renew passport');
    await act(async () => rowFor('Renew passport').focus());
    await user.keyboard('{Enter}');
    await settle();
    expect(screen.getByRole('dialog', { name: 'Reminder' })).toBeInTheDocument();
    expect(screen.getByLabelText('Title')).toHaveValue('Renew passport');
  });
});

describe('the menus', () => {
  it('keeps the row commands dead until a row has the cursor', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await add(user, 'Buy milk');
    expect(command('edit', 'delete').enabled).toBe(false);

    await act(async () => rowFor('Buy milk').focus());
    expect(command('edit', 'delete').enabled).toBe(true);
    expect(command('edit', 'toggle-completed').label).toBe('Mark as Completed');

    await choose('edit', 'delete');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    await flush();
    expect((await saved()).items).toHaveLength(0);
  });

  it('switches smart list and remembers it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await add(user, 'Someday');
    await choose('view', 'smart-scheduled');
    expect(screen.getByText('Nothing scheduled ahead.')).toBeInTheDocument();

    await choose('view', 'smart-all');
    expect(rowFor('Someday')).toBeInTheDocument();
    await flush();
    expect((await saved()).prefs.selection).toBe('smart:all');
  });

  it('shows the completed ones again when asked', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await choose('view', 'smart-all');
    await add(user, 'Wash up');
    await act(async () => rowFor('Wash up').focus());
    await choose('edit', 'toggle-completed');
    expect(screen.queryByRole('option', { name: /Wash up/ })).not.toBeInTheDocument();

    await choose('view', 'show-completed');
    expect(rowFor('Wash up')).toBeInTheDocument();
    expect(screen.getByText('1 completed')).toBeInTheDocument();
  });

  it('flags a reminder and finds it under Flagged', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await add(user, 'Pay the bill');
    await act(async () => rowFor('Pay the bill').focus());
    await choose('edit', 'toggle-flagged');
    await choose('view', 'smart-flagged');
    expect(rowFor('Pay the bill')).toBeInTheDocument();
  });
});

describe('repeating reminders', () => {
  it('opens the next occurrence as one is ticked off', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await add(user, 'Bins out every week');
    await act(async () => rowFor('Bins out').focus());
    await choose('edit', 'toggle-completed');
    await flush();

    const file = await saved();
    expect(file.items).toHaveLength(2);
    expect(file.items[0]).toMatchObject({ completed: true, due: '2026-09-04', repeat: null });
    expect(file.items[1]).toMatchObject({
      completed: false,
      due: '2026-09-11',
      repeat: { freq: 'weekly', interval: 1 },
    });
  });
});

describe('search and the sidebar', () => {
  it('narrows the list to what matches', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await choose('view', 'smart-all');
    await add(user, 'Buy oat milk');
    await add(user, 'Book train');

    await user.type(screen.getByLabelText('Search reminders'), 'milk');
    await settle();
    expect(screen.getAllByRole('option')).toHaveLength(1);
    expect(rowFor('Buy oat milk')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Search reminders'));
    await settle();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });

  it('counts what is open beside each list', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await add(user, 'Today thing');
    const sidebar = screen.getByRole('navigation', { name: 'Sidebar' });
    expect(within(sidebar).getByRole('button', { name: /^Today/ })).toHaveTextContent('1');
  });

  it('folds the sidebar away on a narrow window and offers the lists as a menu', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    windowWidth = 420;
    await mount();
    expect(screen.queryByRole('navigation', { name: 'Sidebar' })).not.toBeInTheDocument();
    // The list itself still works at that width.
    expect(field()).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Lists' }));
    await settle();
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitemradio', { name: 'Today' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await act(async () => {
      await user.click(within(menu).getByRole('menuitemradio', { name: 'Flagged' }));
    });
    await settle();
    expect(within(screen.getByRole('toolbar')).getByText('Flagged')).toBeInTheDocument();
  });

  it('hides it on a wide window too when the user says so', async () => {
    await mount();
    expect(screen.getByRole('navigation', { name: 'Sidebar' })).toBeInTheDocument();
    await choose('view', 'sidebar');
    expect(screen.queryByRole('navigation', { name: 'Sidebar' })).not.toBeInTheDocument();
    await flush();
    expect((await saved()).prefs.showSidebar).toBe(false);
  });
});

describe('the details dialog', () => {
  it('saves the fields it was given', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await add(user, 'Renew passport');
    await act(async () => rowFor('Renew passport').focus());
    await choose('edit', 'edit-details');

    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Renew the passport');
    await user.type(screen.getByLabelText('Notes'), 'Photos first');
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save' }));
    });
    await settle();
    await flush();

    const file = await saved();
    expect(file.items[0]).toMatchObject({ title: 'Renew the passport', notes: 'Photos first' });
  });
});
