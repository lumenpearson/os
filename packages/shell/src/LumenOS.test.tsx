import { useSessionStore, useWindowStore } from '@lumen/kernel';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LumenOS } from './LumenOS';

/*
 * The one call the shell makes into the host that has a consequence if it is
 * missed: on the desktop, an interface that never reports is given up on the
 * next start. The real web platform's `ready` is a no-op, so it is wrapped
 * here to be watched rather than replaced.
 */
const { reportedReady } = vi.hoisted(() => ({ reportedReady: vi.fn(async () => {}) }));
vi.mock('@lumen/platform', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@lumen/platform')>();
  return {
    ...actual,
    createPlatform: async (version?: string) => {
      const platform = await actual.createPlatform(version);
      return { ...platform, interface: { ...platform.interface, ready: reportedReady } };
    },
  };
});

/**
 * Boots the real OS against the in-memory platform the web build falls back
 * to under happy-dom, and walks the session states a user passes through.
 */
describe('LumenOS', () => {
  beforeEach(() => {
    useWindowStore.setState({ windows: {}, order: [], focusedId: null });
    useSessionStore.setState({ state: 'booting', failedAttempts: 0, lockedUntil: null });
    reportedReady.mockClear();
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

  it('tells the host the interface drew itself, so the version is not given up', async () => {
    render(<LumenOS autoSetup={{ name: 'Ada Lovelace' }} />);
    await waitFor(() => expect(screen.getByTestId('lock-screen')).toBeInTheDocument(), {
      timeout: 15_000,
    });
    await waitFor(() => expect(reportedReady).toHaveBeenCalled());
  });
});
