/**
 * Same environment note as Browser.test.tsx: the frame is the only part of
 * this app that touches the network, so the environment is told not to fetch
 * iframe documents.
 *
 * @vitest-environment happy-dom
 * @vitest-environment-options { "settings": { "navigation": { "disableChildFrameNavigation": true } } }
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Frame } from './Frame';
import { createTab, type Tab, type TabDefaults } from './tabs';

const outside: TabDefaults = { zoom: 1, externalHosts: ['ada.example'] };

function show(tab: Tab, timeoutMs = 20) {
  const handlers = {
    onLoaded: vi.fn(),
    onBlocked: vi.fn(),
    onReload: vi.fn(),
    onOpenOutside: vi.fn(),
    onAlwaysOutside: vi.fn(),
    onStopOutside: vi.fn(),
  };
  render(
    <Frame
      tab={tab}
      active
      sandbox="allow-scripts allow-forms"
      timeoutMs={timeoutMs}
      {...handlers}
    />,
  );
  return handlers;
}

const iframe = () => document.querySelector('iframe');

afterEach(cleanup);

describe('a frame that might work', () => {
  it('carries the sandbox attribute it is given, and nothing else', () => {
    show(createTab('t1', 'https://ada.example/'));
    expect(iframe()).toHaveAttribute('sandbox', 'allow-scripts allow-forms');
    expect(iframe()).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('is called blocked once the wait it was given runs out', async () => {
    const handlers = show(createTab('t1', 'https://ada.example/'), 20);
    expect(handlers.onBlocked).not.toHaveBeenCalled();
    await waitFor(() => expect(handlers.onBlocked).toHaveBeenCalledWith('t1'));
  });

  it('waits for nothing when the tab is not loading', async () => {
    const tab = { ...createTab('t1', 'https://ada.example/'), status: 'idle' as const };
    const handlers = show(tab, 5);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(handlers.onBlocked).not.toHaveBeenCalled();
  });
});

describe('a frame that cannot work', () => {
  it('is never created for a host known to refuse, and says so at once', () => {
    const handlers = show(createTab('t1', 'https://www.google.com/'), 10_000);
    expect(iframe()).toBeNull();
    expect(handlers.onBlocked).toHaveBeenCalledWith('t1');
  });

  it('offers the way out and the way to make it the default', async () => {
    const blocked = { ...createTab('t1', 'https://www.google.com/'), status: 'blocked' as const };
    const handlers = show(blocked);
    expect(
      screen.getByText(
        'google.com sends X-Frame-Options: SAMEORIGIN, so only google.com may embed its pages.',
      ),
    ).toBeInTheDocument();

    screen.getByRole('button', { name: 'Open Outside Lumen' }).click();
    screen.getByRole('button', { name: 'Always Open Outside' }).click();
    screen.getByRole('button', { name: 'Try Again' }).click();
    await waitFor(() => {
      expect(handlers.onOpenOutside).toHaveBeenCalledWith('https://www.google.com/');
      expect(handlers.onAlwaysOutside).toHaveBeenCalledWith('https://www.google.com/');
      expect(handlers.onReload).toHaveBeenCalledWith('t1');
    });
  });

  it('leaves out the way out for an address nothing outside can open either', () => {
    const blocked = { ...createTab('t1', 'ftp://files.ada.example/'), status: 'blocked' as const };
    show(blocked);
    expect(screen.getByText('Only http and https open here')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open Outside Lumen' })).toBeNull();
  });
});

describe('a site on the open-outside list', () => {
  it('gets no frame at all, and can be taken off the list from the panel', async () => {
    const handlers = show(createTab('t1', 'https://ada.example/', outside));
    expect(iframe()).toBeNull();
    expect(screen.getByText('This site opens outside Lumen')).toBeInTheDocument();
    expect(handlers.onBlocked).not.toHaveBeenCalled();

    screen.getByRole('button', { name: 'Stop Opening Outside' }).click();
    await waitFor(() =>
      expect(handlers.onStopOutside).toHaveBeenCalledWith('https://ada.example/'),
    );
  });
});
