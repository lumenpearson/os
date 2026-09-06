import type { Settings } from '@lumen/kernel';
import {
  type AppDefinition,
  createKernel,
  type Kernel,
  useProcessStore,
  useSettingsStore,
  useWindowStore,
} from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { createWebPlatform } from '@lumen/platform';
import { MemoryAdapter } from '@lumen/vfs';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useShellStore } from '../shellStore';
import { Taskbar } from './Taskbar';

const Dummy = () => null;

function app(id: string, name: string): AppDefinition {
  return {
    id,
    name,
    description: name,
    category: 'utilities',
    icon: Dummy,
    component: Dummy,
    window: { width: 400, height: 300 },
  };
}

const APPS = [
  app('lumen.files', 'Files'),
  app('lumen.notes', 'Notes'),
  app('lumen.terminal', 'Terminal'),
  app('lumen.paint', 'Paint'),
];

let kernel: Kernel;

function setTaskbar(patch: Partial<Settings['taskbar']>) {
  act(() => {
    useSettingsStore.getState().patch('taskbar', patch);
  });
}

function mount() {
  return render(
    <KernelProvider kernel={kernel}>
      <Taskbar />
    </KernelProvider>,
  );
}

const bar = () => screen.getByTestId('taskbar');
const itemOrder = () =>
  [...bar().querySelectorAll<HTMLElement>('[data-taskbar-item]')].map(
    (el) => el.dataset.taskbarItem,
  );
const pinnedButtons = () => [
  ...screen.getByTestId('taskbar-pinned').querySelectorAll<HTMLElement>('[data-taskbar-icon]'),
];

/** happy-dom lays nothing out, so a drag needs the geometry it would have had. */
function stubRow(buttons: HTMLElement[], pitch: number, span: number) {
  buttons.forEach((el, i) => {
    const start = i * pitch;
    el.getBoundingClientRect = () =>
      ({
        x: start,
        y: 0,
        left: start,
        top: 0,
        width: span,
        height: span,
        right: start + span,
        bottom: span,
        toJSON: () => ({}),
      }) as DOMRect;
  });
}

beforeEach(async () => {
  const platform = createWebPlatform();
  kernel = createKernel({
    platform: { ...platform, adapter: new MemoryAdapter() },
    apps: APPS,
    autoSetup: { name: 'Ada Lovelace' },
  });
  await kernel.boot();
  useSettingsStore.getState().patch('taskbar', {
    position: 'bottom',
    size: 44,
    autoHide: false,
    magnify: false,
    floating: false,
    centered: true,
    showLabels: false,
    showRecents: true,
    pinned: ['lumen.files', 'lumen.notes', 'lumen.terminal'],
    items: ['start', 'pinned', 'clock'],
  });
});

afterEach(() => {
  cleanup();
  kernel.dispose();
  useSettingsStore.getState().reset();
  useShellStore.getState().closeAll();
  useWindowStore.setState({ windows: {}, order: [], focusedId: null });
  useProcessStore.setState({ processes: {}, nextPid: 100 });
});

describe('items', () => {
  it('draws the pieces in the order the setting gives', () => {
    setTaskbar({ items: ['clock', 'trash', 'start', 'pinned', 'search'] });
    mount();
    expect(itemOrder()).toEqual(['clock', 'trash', 'start', 'pinned', 'search']);
  });

  it('ignores ids it does not know, and draws a repeated id once', () => {
    setTaskbar({ items: ['start', 'stocks', 'pinned', 'start'] });
    mount();
    expect(itemOrder()).toEqual(['start', 'pinned']);
  });

  it('carries only what the list asks for', () => {
    setTaskbar({ items: ['clock'] });
    mount();
    expect(itemOrder()).toEqual(['clock']);
    expect(screen.queryByTestId('start-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('taskbar-pinned')).not.toBeInTheDocument();
  });

  it('opens Spotlight from the search piece', async () => {
    setTaskbar({ items: ['search'] });
    mount();
    expect(useShellStore.getState().spotlight).toBe(false);
    fireEvent.click(screen.getByTestId('taskbar-search'));
    await waitFor(() => expect(useShellStore.getState().spotlight).toBe(true));
  });

  it('says plainly that weather and news have no source behind them', () => {
    setTaskbar({ items: ['weather', 'news'] });
    mount();
    expect(screen.getByTestId('taskbar-weather')).toHaveTextContent('No weather source');
    expect(screen.getByTestId('taskbar-news')).toHaveTextContent('No news source');
  });

  it('shows running apps that are not pinned, unless Settings says not to', async () => {
    setTaskbar({ items: ['pinned', 'windows'], pinned: ['lumen.files'] });
    mount();
    act(() => {
      kernel.launch('lumen.paint');
    });
    await waitFor(() => expect(screen.getByTestId('taskbar-windows')).toBeInTheDocument());
    expect(screen.getByTestId('taskbar-lumen.paint')).toBeInTheDocument();

    setTaskbar({ showRecents: false });
    expect(screen.queryByTestId('taskbar-windows')).not.toBeInTheDocument();
  });

  it('draws the apps that opened the most documents, counted from Recents', () => {
    kernel.updateState({
      recents: [
        { path: '/a.txt', openedAt: 3, appId: 'lumen.notes' },
        { path: '/b.txt', openedAt: 2, appId: 'lumen.notes' },
        { path: '/c.txt', openedAt: 1, appId: 'lumen.paint' },
      ],
    });
    setTaskbar({ items: ['frequent'], pinned: [] });
    mount();
    const glyphs = [
      ...screen
        .getByTestId('taskbar-frequent')
        .querySelectorAll<HTMLElement>('[data-taskbar-icon]'),
    ];
    expect(glyphs.map((el) => el.getAttribute('aria-label'))).toEqual(['Notes', 'Paint']);
  });

  it('keeps the clock in the format the menubar and Region settings give', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T15:04:05Z'));
    try {
      act(() => {
        useSettingsStore.getState().patch('menubar', {
          clock24h: true,
          showSeconds: false,
          showDate: false,
          showDayOfWeek: false,
        });
        useSettingsStore.getState().patch('region', { locale: 'en-GB', timeZone: 'UTC' });
      });
      setTaskbar({ items: ['clock'] });
      mount();
      expect(screen.getByTestId('taskbar-clock').textContent).toBe('15:04');

      act(() => {
        useSettingsStore.getState().patch('menubar', { clock24h: false, showSeconds: true });
      });
      expect(screen.getByTestId('taskbar-clock').textContent).toMatch(/^3:04:05/);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('floating', () => {
  it('is pinned to the edge by default', () => {
    mount();
    expect(bar().dataset.floating).toBe('false');
    expect(bar().className).toContain('inset-x-0');
    expect(bar().style.bottom).toBe('');
  });

  for (const [position, edge] of [
    ['bottom', 'bottom'],
    ['left', 'left'],
    ['right', 'right'],
  ] as const) {
    it(`detaches from the ${position} edge, with its own radius and shadow`, () => {
      setTaskbar({ position, floating: true });
      mount();
      const nav = bar();
      expect(nav.dataset.floating).toBe('true');
      expect(nav.dataset.position).toBe(position);
      expect(nav.className).toContain('rounded-lg');
      expect(nav.className).toContain('shadow-md');
      // The pill is inset inside the band the shell reserves for the bar…
      expect(nav.style.getPropertyValue(edge)).toBe('calc((var(--lumen-taskbar-h) - 50px) / 2)');
      // …and no longer spans the whole edge.
      expect(nav.className).not.toContain('inset-x-0');
      expect(nav.className).not.toContain('w-(--lumen-taskbar-h)');
    });
  }

  it('still slides away when auto-hide is on, clearing its own margin', () => {
    setTaskbar({ floating: true, autoHide: true });
    mount();
    expect(bar().className).toContain('translate-y-[calc(100%+var(--lumen-taskbar-h))]');
  });
});

describe('dragging a pinned icon', () => {
  it('reorders the pinned list, and only on the drop', async () => {
    setTaskbar({ items: ['pinned'] });
    mount();
    const buttons = pinnedButtons();
    expect(buttons.map((el) => el.getAttribute('aria-label'))).toEqual([
      'Files',
      'Notes',
      'Terminal',
    ]);
    stubRow(buttons, 48, 44);
    const dragged = buttons[0] as HTMLElement;

    fireEvent.pointerDown(dragged, { clientX: 22, clientY: 22, button: 0 });
    fireEvent.pointerMove(window, { clientX: 118, clientY: 22 });

    // The move is written to the DOM, not to the store.
    await waitFor(() => expect(dragged.style.transform).toBe('translateX(96px)'));
    expect(buttons[1]?.style.transform).toBe('translateX(-48px)');
    expect(useSettingsStore.getState().settings.taskbar.pinned).toEqual([
      'lumen.files',
      'lumen.notes',
      'lumen.terminal',
    ]);

    fireEvent.pointerUp(window, { clientX: 118, clientY: 22 });
    expect(useSettingsStore.getState().settings.taskbar.pinned).toEqual([
      'lumen.notes',
      'lumen.terminal',
      'lumen.files',
    ]);
    expect(dragged.style.transform).toBe('');
  });

  it('leaves the order alone when the icon is only clicked', async () => {
    setTaskbar({ items: ['pinned'] });
    mount();
    const launch = vi.spyOn(kernel, 'launch');
    const buttons = pinnedButtons();
    stubRow(buttons, 48, 44);
    const first = buttons[0] as HTMLElement;

    fireEvent.pointerDown(first, { clientX: 22, clientY: 22, button: 0 });
    fireEvent.pointerMove(window, { clientX: 24, clientY: 22 });
    fireEvent.pointerUp(window, { clientX: 24, clientY: 22 });
    fireEvent.click(first);

    expect(useSettingsStore.getState().settings.taskbar.pinned).toEqual([
      'lumen.files',
      'lumen.notes',
      'lumen.terminal',
    ]);
    expect(launch).toHaveBeenCalledWith('lumen.files');
  });
});

describe('magnify on hover', () => {
  it('grows the icon under the pointer, and leaves the far ones alone', async () => {
    setTaskbar({ items: ['pinned'], magnify: true });
    mount();
    const buttons = pinnedButtons();
    stubRow(buttons, 48, 44);
    const glyph = (el: HTMLElement) =>
      el.querySelector<HTMLElement>('[data-taskbar-glyph]') as HTMLElement;

    const scaleOf = (el: HTMLElement) =>
      Number(/scale\(([\d.]+)\)/.exec(glyph(el).style.transform)?.[1] ?? 1);

    fireEvent.pointerMove(screen.getByTestId('taskbar-row'), { clientX: 22, clientY: 22 });
    await waitFor(() => expect(scaleOf(buttons[0] as HTMLElement)).toBeGreaterThan(1.4));
    expect(scaleOf(buttons[1] as HTMLElement)).toBeLessThan(scaleOf(buttons[0] as HTMLElement));
    expect(scaleOf(buttons[2] as HTMLElement)).toBeLessThan(scaleOf(buttons[1] as HTMLElement));

    fireEvent.pointerLeave(screen.getByTestId('taskbar-row'));
    expect(glyph(buttons[0] as HTMLElement).style.transform).toBe('');
  });

  it('stays still when Settings has it off', async () => {
    setTaskbar({ items: ['pinned'], magnify: false });
    mount();
    const buttons = pinnedButtons();
    stubRow(buttons, 48, 44);
    fireEvent.pointerMove(screen.getByTestId('taskbar-row'), { clientX: 22, clientY: 22 });
    await Promise.resolve();
    expect(
      (buttons[0] as HTMLElement).querySelector<HTMLElement>('[data-taskbar-glyph]')?.style
        .transform,
    ).toBe('');
  });

  it('stays still under Low Power Mode, with the setting left as it was', async () => {
    setTaskbar({ items: ['pinned'], magnify: true });
    act(() => {
      useSettingsStore.getState().patch('power', { lowPowerMode: true });
    });
    mount();
    const buttons = pinnedButtons();
    stubRow(buttons, 48, 44);
    fireEvent.pointerMove(screen.getByTestId('taskbar-row'), { clientX: 22, clientY: 22 });
    await Promise.resolve();
    expect(
      (buttons[0] as HTMLElement).querySelector<HTMLElement>('[data-taskbar-glyph]')?.style
        .transform,
    ).toBe('');
    expect(useSettingsStore.getState().settings.taskbar.magnify).toBe(true);
  });
});

describe('the context menu', () => {
  it('opens from the keyboard as well as the pointer', async () => {
    setTaskbar({ items: ['pinned'] });
    mount();
    const first = pinnedButtons()[0] as HTMLElement;
    fireEvent.keyDown(first, { key: 'F10', shiftKey: true });
    await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument());
    expect(screen.getByText('Unpin from Taskbar')).toBeInTheDocument();
  });
});

describe('the recycle bin', () => {
  it('says when it is empty, and follows what lands in it', async () => {
    setTaskbar({ items: ['trash'] });
    mount();
    await waitFor(() =>
      expect(screen.getByTestId('taskbar-trash')).toHaveAttribute(
        'aria-label',
        'Recycle Bin, empty',
      ),
    );
    expect(screen.getByTestId('taskbar-trash').dataset.full).toBe('false');

    await act(async () => {
      await kernel.vfs.writeText('/Trash/notes.txt', 'x');
    });
    await waitFor(() =>
      expect(screen.getByTestId('taskbar-trash')).toHaveAttribute(
        'aria-label',
        'Recycle Bin, 1 item',
      ),
    );
    expect(screen.getByTestId('taskbar-trash').dataset.full).toBe('true');
  });

  it('counts what is already there, and opens Files at the trash', async () => {
    await kernel.vfs.writeText('/Trash/one.txt', 'x');
    await kernel.vfs.writeText('/Trash/two.txt', 'x');
    setTaskbar({ items: ['trash'] });
    mount();
    await waitFor(() =>
      expect(screen.getByTestId('taskbar-trash')).toHaveAttribute(
        'aria-label',
        'Recycle Bin, 2 items',
      ),
    );

    const launch = vi.spyOn(kernel, 'launch');
    fireEvent.click(screen.getByTestId('taskbar-trash'));
    expect(launch).toHaveBeenCalledWith('lumen.files', { path: '/Trash' });
  });
});
