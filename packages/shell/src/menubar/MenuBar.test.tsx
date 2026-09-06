import type { Kernel } from '@lumen/kernel';
import { useWindowStore } from '@lumen/kernel';
import { KernelProvider } from '@lumen/kernel/react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
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
