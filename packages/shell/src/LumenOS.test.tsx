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
    /*
     * The same fifteen seconds the boot above gets, and for the same reason:
     * `Desktop` is a lazy import, so unlocking suspends while the chunk
     * loads. React 19 hides the lock screen with an inline
     * `display: none !important` while it waits, which is what this looked
     * like when the default one second ran out under a loaded machine — a
     * flake that only ever appeared when the whole workspace was building
     * beside it.
     */
    await waitFor(() => expect(screen.getByTestId('desktop')).toBeInTheDocument(), {
      timeout: 15_000,
    });
    expect(screen.getByTestId('menubar')).toBeInTheDocument();
    expect(screen.getByTestId('taskbar')).toBeInTheDocument();
    expect(screen.getByTestId('start-button')).toBeInTheDocument();
  }, 30_000);
});
