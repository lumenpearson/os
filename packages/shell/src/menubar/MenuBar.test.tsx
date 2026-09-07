import type { Kernel, MenuTemplate } from '@lumen/kernel';
import { useMenuStore, useWindowStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useShellStore } from '../shellStore';
import { MenuBar } from './MenuBar';

/** The bar only calls the kernel when an item is chosen. */
const kernel = { launch: async () => 1 } as unknown as Kernel;

function mount() {
  return render(
    <KernelProvider kernel={kernel}>
      <MenuBar />
    </KernelProvider>,
  );
}

beforeEach(() => {
  useWindowStore.setState({ windows: {}, order: [], focusedId: null });
  useMenuStore.setState({ byWindow: {} });
  useShellStore.setState({ controlCenter: false, notificationCenter: false, spotlight: false });
});

describe('the system bar menu', () => {
  it('opens on a right-click anywhere along the bar', () => {
    mount();
    fireEvent.contextMenu(screen.getByTestId('menubar'));
    expect(screen.getByRole('menuitem', { name: /Control Center/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Notifications/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Menubar Settings/ })).toBeInTheDocument();
  });

  it('opens the control centre from the menu', async () => {
    const user = userEvent.setup();
    mount();
    fireEvent.contextMenu(screen.getByTestId('menubar'));
    await user.click(screen.getByRole('menuitem', { name: /Control Center/ }));
    expect(useShellStore.getState().controlCenter).toBe(true);
  });

  it('opens from the keyboard, from whichever of the bar’s buttons has focus', async () => {
    const user = userEvent.setup();
    mount();
    screen.getByLabelText('Control Center').focus();
    await user.keyboard('{Shift>}{F10}{/Shift}');
    expect(screen.getByRole('menuitem', { name: /Notifications/ })).toBeInTheDocument();
  });

  it('does not open a bar menu at the same time as the one under the pointer', () => {
    mount();
    const title = screen.getByTestId('menubar').querySelector('[data-menu-id="system"]');
    if (!title) throw new Error('no system menu title on the bar');
    // A right-click on a menu title asks the bar for its menu, not that one.
    fireEvent.pointerDown(title, { button: 2 });
    fireEvent.contextMenu(title);
    expect(screen.queryByRole('menuitem', { name: 'About This Computer' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Control Center/ })).toBeInTheDocument();
  });
});

/**
 * A submenu row is portalled to the body, so it is not inside the bar. The
 * bar closes its menu when a pointer goes down outside itself — and used to
 * count a submenu row as outside, which took the row away on `pointerdown`,
 * before the `pointerup` that runs the command. Every submenu item in the
 * system was dead this way, from the first commit.
 *
 * The test belongs here rather than in the UI package: `MenuList` on its own
 * has no click-outside listener, so the defect only exists once the two are
 * composed, which is what the bar does.
 */
describe('a submenu item', () => {
  /** A focused window whose menubar carries one submenu with one row. */
  function mountWithSubmenu(onSelect: () => void) {
    const win = useWindowStore
      .getState()
      .open(1, 'lumen.notes', { width: 600, height: 400, title: 'Notes' });
    const menus: MenuTemplate[] = [
      {
        id: 'view',
        label: 'View',
        items: [
          {
            id: 'view.sort',
            label: 'Sort By',
            type: 'submenu',
            submenu: [{ id: 'view.sort.title', label: 'Title', onSelect }],
          },
        ],
      },
    ];
    useMenuStore.getState().setMenus(win.id, menus);
    return mount();
  }

  /** The bar's titles open on pointer-down, and a submenu opens on hover. */
  function openTitle(label: string) {
    fireEvent.pointerDown(screen.getByRole('menuitem', { name: label }), { button: 0 });
  }

  function openTheSubmenu() {
    openTitle('View');
    fireEvent.pointerEnter(screen.getByRole('menuitem', { name: /Sort By/ }));
    return screen.getByRole('menuitem', { name: 'Title' });
  }

  it('runs its command when it is pressed', () => {
    const onSelect = vi.fn();
    mountWithSubmenu(onSelect);
    const row = openTheSubmenu();

    // A real press: down, then up. The bug lived in the gap between them.
    fireEvent.pointerDown(row, { button: 0 });
    expect(
      screen.queryByRole('menuitem', { name: 'Title' }),
      'the row is still there to receive the pointer-up',
    ).toBeInTheDocument();
    fireEvent.pointerUp(row, { button: 0 });
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('still closes the whole menu when the press lands outside it', () => {
    mountWithSubmenu(() => {});
    openTheSubmenu();
    fireEvent.pointerDown(document.body, { button: 0 });
    expect(screen.queryByRole('menuitem', { name: /Sort By/ })).not.toBeInTheDocument();
  });

  it('opens on ArrowRight rather than letting the bar step to the next title', async () => {
    const user = userEvent.setup();
    const win = useWindowStore
      .getState()
      .open(1, 'lumen.notes', { width: 600, height: 400, title: 'Notes' });
    useMenuStore.getState().setMenus(win.id, [
      {
        id: 'view',
        label: 'View',
        items: [
          {
            id: 'view.sort',
            label: 'Sort By',
            type: 'submenu',
            submenu: [{ id: 'view.sort.title', label: 'Title', onSelect: () => {} }],
          },
        ],
      },
      { id: 'format', label: 'Format', items: [{ id: 'format.bold', label: 'Bold' }] },
    ]);
    mount();
    openTitle('View');
    await user.keyboard('{ArrowDown}{ArrowRight}');
    expect(screen.getByRole('menuitem', { name: 'Title' })).toBeInTheDocument();
    // And the bar did not take the key as "next menu".
    expect(screen.queryByRole('menuitem', { name: 'Bold' })).not.toBeInTheDocument();
  });
});
