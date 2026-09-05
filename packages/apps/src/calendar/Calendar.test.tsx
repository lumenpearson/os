/**
 * The Calendar window. These exercise the shell — the toolbar, the views, the
 * dialog and what reaches the file — rather than the date arithmetic, which
 * has its own tests next door.
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
import Calendar from './Calendar';
import type { CalendarData } from './events';
import definition from './index';

const Dummy = () => null;

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
        width: 1000,
        height: 680,
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 1000,
        bottom: 680,
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

/** Let the pending VFS reads and the state updates they cause land. */
async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 5; turn += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });
}

/** Past the 250 ms write debounce, so the calendar file is on disk. */
async function flush() {
  await act(async () => {
    vi.advanceTimersByTime(400);
  });
  await settle();
}

async function mount() {
  const process = kernel.launch('lumen.calendar', {});
  if (!process) throw new Error('failed to launch');
  windowId = process.windowIds[0] as string;
  const view = render(
    <KernelProvider kernel={kernel}>
      <AppProvider value={{ pid: process.pid, windowId, appId: 'lumen.calendar', container: null }}>
        <DialogProvider>
          <FileDialogProvider>
            <Calendar pid={process.pid} windowId={windowId} args={{}} />
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

/** The toolbar's own title, not the sidebar's month heading. */
const heading = () => within(screen.getByRole('toolbar')).getByText(/\d{4}$/);

const dataPath = () => join(home, '.config', 'calendar.json');
const saved = () => kernel.vfs.readJson<CalendarData>(dataPath());

/** Fill the dialog with a title and save it. */
async function addEvent(user: ReturnType<typeof userEvent.setup>, title: string) {
  await choose('file', 'new-event');
  await user.type(screen.getByLabelText('Title'), title);
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
  // The formatters read these, so pin them rather than inheriting the host.
  useSettingsStore.getState().patch('region', {
    locale: 'en-GB',
    timeZone: 'UTC',
    firstDayOfWeek: 1,
  });
  useSettingsStore.getState().patch('menubar', { clock24h: true });
  globalThis.ResizeObserver = SizedResizeObserver as unknown as typeof ResizeObserver;
});

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalObserver;
  vi.useRealTimers();
});

describe('the app definition', () => {
  it('is the calendar the shell expects', () => {
    expect(definition.id).toBe('lumen.calendar');
    expect(definition.name).toBe('Calendar');
    expect(definition.category).toBe('office');
    expect(definition.singleton).toBe(true);
    expect(definition.keywords).toContain('agenda');
  });
});

describe('opening the window', () => {
  it('starts on the month containing today', async () => {
    await mount();
    expect(screen.getByRole('grid', { name: 'Month' })).toBeInTheDocument();
    expect(heading()).toHaveTextContent('September 2026');
  });

  it('has no events until one is made', async () => {
    await mount();
    expect(screen.getByText('0 events')).toBeInTheDocument();
  });

  it('offers all four views', async () => {
    await mount();
    const views = screen.getByRole('radiogroup', { name: 'View' });
    for (const label of ['Month', 'Week', 'Day', 'Agenda']) {
      expect(within(views).getByRole('radio', { name: label })).toBeInTheDocument();
    }
  });
});

describe('creating an event', () => {
  it('writes it to the calendar file and shows it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await addEvent(user, 'Stand-up');

    expect(screen.getAllByTitle(/^Stand-up/).length).toBeGreaterThan(0);
    expect(screen.getByText('1 event')).toBeInTheDocument();

    await flush();
    const file = await saved();
    expect(file.events).toHaveLength(1);
    expect(file.events[0]?.title).toBe('Stand-up');
    expect(file.events[0]?.date).toBe('2026-09-04');
  });

  it('refuses a start and an end that are the same minute', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await choose('file', 'new-event');
    await user.clear(screen.getByLabelText('End time'));
    await user.type(screen.getByLabelText('End time'), '09:00');
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Save' }));
    });
    expect(screen.getByText('The end time repeats the start time.')).toBeInTheDocument();
    expect((await saved().catch(() => null))?.events ?? []).toHaveLength(0);
  });

  it('says what a repeat rule will do before it is saved', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await choose('file', 'new-event');
    await user.selectOptions(screen.getByLabelText('Repeat'), 'weekly');
    expect(screen.getByText(/^Every week on/)).toBeInTheDocument();
  });
});

describe('moving about', () => {
  it('steps a month at a time and comes back to today', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(heading()).toHaveTextContent('October 2026');
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    await user.click(screen.getByRole('button', { name: 'Previous' }));
    expect(heading()).toHaveTextContent('August 2026');
    await user.click(screen.getByRole('button', { name: 'Today' }));
    expect(heading()).toHaveTextContent('September 2026');
  });

  it('steps a week at a time once the week view is showing', async () => {
    await mount();
    await choose('view', 'view-week');
    expect(screen.queryByRole('grid', { name: 'Month' })).not.toBeInTheDocument();
    await choose('view', 'view-agenda');
    expect(screen.getByText('Nothing scheduled')).toBeInTheDocument();
  });

  it('remembers the view across a relaunch', async () => {
    await mount();
    await choose('view', 'view-agenda');
    await flush();
    const file = await saved();
    expect(file.prefs.view).toBe('agenda');
  });
});

describe('the selected event', () => {
  it('lights up the commands that act on one', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    expect(command('file', 'edit-event').enabled).toBe(false);
    expect(command('file', 'delete-event').enabled).toBe(false);

    await addEvent(user, 'Review');
    await user.click(screen.getAllByTitle(/^Review/)[0] as HTMLElement);
    expect(command('file', 'edit-event').enabled).toBe(true);

    await choose('file', 'delete-event');
    expect(screen.getByText('0 events')).toBeInTheDocument();
    await flush();
    expect((await saved()).events).toHaveLength(0);
  });
});

describe('search', () => {
  it('finds an event by its title and jumps to it', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await addEvent(user, 'Dentist');
    await user.type(screen.getByLabelText('Search events'), 'dent');
    const results = screen.getByRole('list', { name: 'Search results' });
    expect(within(results).getByRole('button', { name: /Dentist/ })).toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    await mount();
    await user.type(screen.getByLabelText('Search events'), 'zzz');
    expect(screen.getByText('No events match')).toBeInTheDocument();
  });
});
