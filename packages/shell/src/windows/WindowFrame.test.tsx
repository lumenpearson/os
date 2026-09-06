import type { Kernel } from '@lumen/kernel';
import { useRegistryStore, useWindowStore, type WindowState } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
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
