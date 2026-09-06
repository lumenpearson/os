import type { Kernel } from '@lumen/kernel';
import {
  defaultSettings,
  type Rect,
  snapRect,
  useRegistryStore,
  useSettingsStore,
  useWindowStore,
  type WindowState,
} from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSnapPreview } from './SnapPreview';
import { WindowFrame } from './WindowFrame';

/**
 * The frame reaches the kernel for one thing — the guarded close — and the
 * registry for the app's name and icon. Both are cast from the little the
 * component actually reads; writing out a whole Kernel and AppDefinition
 * here would bury what the test is about.
 */
const kernel = { closeWindow: async () => true } as unknown as Kernel;

function windowState(over: Partial<WindowState> = {}): WindowState {
  return {
    id: 'w1',
    pid: 1,
    appId: 'lumen.files',
    title: 'Files',
    bounds: { x: 0, y: 0, width: 600, height: 400 },
    restoreBounds: null,
    minimized: false,
    maximized: false,
    fullscreen: false,
    snap: null,
    zIndex: 100,
    options: {},
    dirty: false,
    documentPath: null,
    createdAt: 0,
    closing: false,
    ...over,
  } as unknown as WindowState;
}

function mount(over: Partial<WindowState> = {}) {
  useWindowStore.setState({
    windows: { w1: windowState(over) },
    order: ['w1'],
    focusedId: 'w1',
    area: { x: 0, y: 26, width: 1280, height: 700 },
  });
  return render(
    <KernelProvider kernel={kernel}>
      <WindowFrame id="w1" />
    </KernelProvider>,
  );
}

/** The title bar is the top 36px of the frame; the app owns everything below. */
const IN_TITLE_BAR = 10;
const IN_BODY = 200;

beforeEach(() => {
  useSettingsStore.setState({ settings: defaultSettings() });
  useRegistryStore.setState({
    apps: {
      'lumen.files': {
        id: 'lumen.files',
        name: 'Files',
        icon: () => null,
      },
    },
  } as unknown as Parameters<typeof useRegistryStore.setState>[0]);
});

describe('the title bar menu', () => {
  it('opens on a right-click on the bar', () => {
    mount();
    fireEvent.contextMenu(screen.getByTestId('window-titlebar'), { clientY: IN_TITLE_BAR });
    expect(screen.getByRole('menuitem', { name: /Minimize/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Zoom/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Close/ })).toBeInTheDocument();
  });

  it('leaves a right-click in the app alone, so the app can answer for it', () => {
    mount();
    fireEvent.contextMenu(screen.getByTestId('window-body'), { clientY: IN_BODY });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('stays out of the way when something inside drew its own menu', () => {
    mount();
    const bar = screen.getByTestId('window-titlebar');
    // A tab strip or toolbar answers the click first and stops the event.
    bar.addEventListener('contextmenu', (e) => e.preventDefault());
    fireEvent.contextMenu(bar, { clientY: IN_TITLE_BAR });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens from the keyboard when the window itself has focus', async () => {
    const user = userEvent.setup();
    mount();
    screen.getByTestId('window').focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    expect(screen.getByRole('menuitem', { name: /Snap Left/ })).toBeInTheDocument();
  });

  it('minimizes the window from the menu', async () => {
    const user = userEvent.setup();
    mount();
    fireEvent.contextMenu(screen.getByTestId('window-titlebar'), { clientY: IN_TITLE_BAR });
    await user.click(screen.getByRole('menuitem', { name: /Minimize/ }));
    expect(useWindowStore.getState().windows.w1?.minimized).toBe(true);
  });

  it('tiles the window to a half from the menu', async () => {
    const user = userEvent.setup();
    mount();
    fireEvent.contextMenu(screen.getByTestId('window-titlebar'), { clientY: IN_TITLE_BAR });
    await user.click(screen.getByRole('menuitem', { name: /Snap Right/ }));
    expect(useWindowStore.getState().windows.w1?.snap).toBe('right');
  });

  it('follows the window options: an unclosable window offers a dead Close', () => {
    mount({ options: { closable: false } } as Partial<WindowState>);
    fireEvent.contextMenu(screen.getByTestId('window-titlebar'), { clientY: IN_TITLE_BAR });
    expect(screen.getByRole('menuitem', { name: /Close/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});

describe('full screen', () => {
  const frame = () => screen.getByTestId('window');

  it('covers the whole display, panels included', () => {
    mount({ fullscreen: true });
    expect(frame()).toHaveStyle({ width: '100%', height: '100%' });
  });

  it('stops at the work area when told not to cover the panels', () => {
    useSettingsStore.getState().patch('windows', { fullscreenCoversPanels: false });
    mount({ fullscreen: true });
    const area = useWindowStore.getState().area;
    expect(frame()).toHaveStyle({ width: `${area.width}px`, height: `${area.height}px` });
  });

  it('hides the title bar', () => {
    mount({ fullscreen: true });
    expect(screen.queryByTestId('window-titlebar')).not.toBeInTheDocument();
  });

  it('keeps the title bar when the setting says to', () => {
    useSettingsStore.getState().patch('windows', { fullscreenHidesTitleBar: false });
    mount({ fullscreen: true });
    expect(screen.getByTestId('window-titlebar')).toBeInTheDocument();
  });
});

describe('the resize handles', () => {
  /** In the order the frame draws them: n, s, e, w, then the four corners. */
  const handleCursors = () =>
    [...screen.getByTestId('window').querySelectorAll<HTMLElement>('[data-cursor]')].map(
      (el) => el.dataset.cursor,
    );

  it('names the one edge an edge handle moves, and the pair a corner moves', () => {
    mount();
    expect(handleCursors()).toEqual([
      'n-resize',
      's-resize',
      'e-resize',
      'w-resize',
      'nesw-resize',
      'nwse-resize',
      'nwse-resize',
      'nesw-resize',
    ]);
  });
});

describe('the cursor while the window is dragged', () => {
  function pressTitleBar() {
    mount();
    const frame = screen.getByTestId('window');
    fireEvent.pointerDown(screen.getByTestId('window-titlebar'), {
      button: 0,
      clientX: 400,
      clientY: IN_TITLE_BAR,
    });
    return frame;
  }

  it('closes the hand once the window is following it, not on the press', () => {
    const frame = pressTitleBar();
    expect(frame.dataset.cursor).toBeUndefined();

    // Inside the threshold this is still a click on the title bar.
    fireEvent.pointerMove(frame, { clientX: 401, clientY: IN_TITLE_BAR });
    expect(frame.dataset.cursor).toBeUndefined();

    fireEvent.pointerMove(frame, { clientX: 600, clientY: 300 });
    expect(frame.dataset.cursor).toBe('grabbing');

    fireEvent.pointerUp(frame, { clientX: 600, clientY: 300 });
    expect(frame.dataset.cursor).toBeUndefined();
  });

  it('lets go when the host takes the pointer away mid-drag', () => {
    const frame = pressTitleBar();
    fireEvent.pointerMove(frame, { clientX: 600, clientY: 300 });
    expect(frame.dataset.cursor).toBe('grabbing');

    fireEvent.pointerCancel(frame, { clientX: 600, clientY: 300 });
    expect(frame.dataset.cursor).toBeUndefined();
  });
});

describe('the snap preview during a drag', () => {
  /** Away from the corners, so the pointer is in a side zone and not a quadrant. */
  const MID_HEIGHT = 300;

  function dragTitleBar() {
    mount();
    const frame = screen.getByTestId('window');
    fireEvent.pointerDown(screen.getByTestId('window-titlebar'), {
      button: 0,
      clientX: 400,
      clientY: IN_TITLE_BAR,
    });
    const seen: Array<Rect | null> = [];
    const unsubscribe = useSnapPreview.subscribe((s) => seen.push(s.rect));
    return {
      seen,
      moveTo(clientX: number, clientY: number) {
        fireEvent.pointerMove(frame, { clientX, clientY });
      },
      /** Stop listening, then let go in open ground so the drag winds itself up. */
      stop() {
        unsubscribe();
        fireEvent.pointerUp(frame, { clientX: 600, clientY: MID_HEIGHT });
      },
    };
  }

  it('is set once for a zone, not once for every move inside it', () => {
    const drag = dragTitleBar();
    drag.moveTo(4, MID_HEIGHT);
    drag.moveTo(5, MID_HEIGHT + 10);
    drag.moveTo(6, MID_HEIGHT + 20);
    drag.stop();

    const area = useWindowStore.getState().area;
    expect(drag.seen).toEqual([snapRect('left', area, 0)]);
  });

  it('still reports every change of zone, including leaving one', () => {
    const drag = dragTitleBar();
    drag.moveTo(4, MID_HEIGHT);
    drag.moveTo(600, MID_HEIGHT);
    drag.moveTo(1276, MID_HEIGHT);
    drag.stop();

    const area = useWindowStore.getState().area;
    expect(drag.seen).toEqual([snapRect('left', area, 0), null, snapRect('right', area, 0)]);
  });

  it('leaves the preview alone entirely when the drag never nears an edge', () => {
    const drag = dragTitleBar();
    drag.moveTo(600, MID_HEIGHT);
    drag.moveTo(620, MID_HEIGHT);
    drag.stop();

    // The first move states "no zone" once; the rest have nothing to add.
    expect(drag.seen).toEqual([null]);
  });
});
