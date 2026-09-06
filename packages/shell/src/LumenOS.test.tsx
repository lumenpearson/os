import { useSessionStore, useWindowStore } from '@lumen/kernel';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { LumenOS } from './LumenOS';

/**
 * Boots the real OS against the in-memory platform the web build falls back
 * to under happy-dom, and walks the session states a user passes through.
 */
describe('LumenOS', () => {
  beforeEach(() => {
    useWindowStore.setState({ windows: {}, order: [], focusedId: null });
    useSessionStore.setState({ state: 'booting', failedAttempts: 0, lockedUntil: null });
  });

  it('shows the boot screen, then the setup assistant when there is no user', async () => {
    render(<LumenOS />);
    expect(screen.getByTestId('boot-screen')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('setup-assistant')).toBeInTheDocument(), {
      timeout: 15_000,
    });
    expect(screen.getByRole('heading', { name: 'Welcome to Lumen OS' })).toBeInTheDocument();
  });

  it('boots straight to the lock screen with autoSetup, then unlocks to the desktop', async () => {
    render(<LumenOS autoSetup={{ name: 'Ada Lovelace' }} />);
    await waitFor(() => expect(screen.getByTestId('lock-screen')).toBeInTheDocument(), {
      timeout: 15_000,
    });
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();

    // autoSetup creates a passwordless account: a click unlocks it
    await userEvent.click(screen.getByTestId('lock-clock'));
    await waitFor(() => expect(screen.getByTestId('desktop')).toBeInTheDocument());
    expect(screen.getByTestId('menubar')).toBeInTheDocument();
    expect(screen.getByTestId('taskbar')).toBeInTheDocument();
    expect(screen.getByTestId('start-button')).toBeInTheDocument();
  }, 30_000);
});
