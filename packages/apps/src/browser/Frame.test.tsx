/**
 * Same environment note as Browser.test.tsx: the frame is the only part of
 * this app that touches the network, so the environment is told not to fetch
 * iframe documents.
 *
 * @vitest-environment happy-dom
 * @vitest-environment-options { "settings": { "navigation": { "disableChildFrameNavigation": true } } }
 */
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Frame } from './Frame';
import { forgetProbes, type PageProbe } from './probe';
import { createTab, type Tab, type TabDefaults } from './tabs';

const outside: TabDefaults = { zoom: 1, externalHosts: ['ada.example'] };

/**
 * What Lumen answers when the frame asks whether a site allows framing. The
 * question goes over the network, so every test says what comes back rather
 * than letting one reach for a real one.
 */
function answering(probe: Partial<PageProbe> & Pick<PageProbe, 'frame'>) {
  const doFetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ header: null, url: 'https://ada.example/', ...probe }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', doFetch);
  return doFetch;
}

function show(tab: Tab, timeoutMs = 20, viaLumen = false) {
  const handlers = {
    onLoaded: vi.fn(),
    onBlocked: vi.fn(),
    onReload: vi.fn(),
    onMoved: vi.fn(),
    onOpenOutside: vi.fn(),
    onAlwaysOutside: vi.fn(),
    onStopOutside: vi.fn(),
  };
  const draw = (current: Tab) => (
    <Frame
      tab={current}
      active
      sandbox="allow-scripts allow-forms"
      timeoutMs={timeoutMs}
      viaLumen={viaLumen}
      {...handlers}
    />
  );
  const view = render(draw(tab));
  /** The same frame, told the tab has changed — as the browser would. */
  const update = (patch: Partial<Tab>) => view.rerender(draw({ ...tab, ...patch }));
  return { ...handlers, update };
}

const iframe = () => document.querySelector('iframe');

beforeEach(() => {
  forgetProbes();
  answering({ frame: 'allowed' });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

/**
 * LU-1609. A frame the site refuses fires `load` exactly as one that arrived
 * does and never fires `error` — measured in Chromium against both
 * `X-Frame-Options: DENY` and `frame-ancestors 'self'` — so watching the
 * frame told the browser a refusal was a page, and every site that was not on
 * the hand-written list of known refusals showed an empty frame and was
 * called loaded. The site's own headers are the answer, and only the server
 * that fetches the page can read them.
 */
describe('a site whose own answer decides it', () => {
  it('is fetched through Lumen when it says it refuses, load event or not', async () => {
    answering({ frame: 'refused', header: 'X-Frame-Options: DENY' });
    const handlers = show(createTab('t1', 'https://ada.example/'), 10_000, true);
    // Nothing is framed until the site has answered, so there is no load
    // event to be misled by in the first place.
    expect(iframe()).toBeNull();
    await waitFor(() => expect(iframe()?.getAttribute('src')).toContain('/api/page?url='));
    expect(handlers.onBlocked).not.toHaveBeenCalled();
  });

  it('is handed straight to the frame when it says it allows framing', async () => {
    answering({ frame: 'allowed' });
    show(createTab('t1', 'https://ada.example/'), 10_000, true);
    await waitFor(() => expect(iframe()?.getAttribute('src')).toBe('https://ada.example/'));
  });

  it('names the header that refused it when Lumen may not fetch the page', async () => {
    answering({ frame: 'refused', header: 'X-Frame-Options: SAMEORIGIN' });
    const handlers = show(createTab('t1', 'https://ada.example/'), 10_000, false);
    await waitFor(() => expect(handlers.onBlocked).toHaveBeenCalledWith('t1'));
    handlers.update({ status: 'blocked' });
    expect(screen.getByText(/sends X-Frame-Options: SAMEORIGIN/)).toBeInTheDocument();
  });

  it('asks the site itself when nobody could answer, and waits as it used to', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    show(createTab('t1', 'https://ada.example/'), 20, true);
    await waitFor(() => expect(iframe()?.getAttribute('src')).toBe('https://ada.example/'));
    // The frame never reports, so the last resort still applies.
    await waitFor(() => expect(iframe()?.getAttribute('src')).toContain('/api/page?url='));
  });
});

describe('a relayed page that follows a link of its own', () => {
  it('asks the browser to go there, rather than going there itself', async () => {
    /*
     * The page cannot go there itself. It is sandboxed to an opaque origin,
     * so a request it makes for itself reaches Lumen's endpoint marked
     * cross-site and is turned away by the guard that keeps that endpoint
     * from being an open proxy. Asked for by the browser, it is same-origin.
     */
    answering({ frame: 'refused', header: 'X-Frame-Options: DENY' });
    const handlers = show(createTab('t1', 'https://ada.example/'), 10_000, true);
    await waitFor(() => expect(iframe()?.getAttribute('src')).toContain('/api/page?url='));

    window.dispatchEvent(
      new MessageEvent('message', {
        source: (iframe() as HTMLIFrameElement).contentWindow,
        data: { lumen: 'page-moved', url: 'https://ada.example/two' },
      }),
    );
    await waitFor(() =>
      expect(handlers.onMoved).toHaveBeenCalledWith('t1', 'https://ada.example/two'),
    );
  });

  it('ignores a message from anywhere but its own frame', async () => {
    answering({ frame: 'refused', header: 'X-Frame-Options: DENY' });
    const handlers = show(createTab('t1', 'https://ada.example/'), 10_000, true);
    await waitFor(() => expect(iframe()?.getAttribute('src')).toContain('/api/page?url='));
    window.dispatchEvent(
      new MessageEvent('message', { data: { lumen: 'page-moved', url: 'https://evil.example/' } }),
    );
    expect(handlers.onMoved).not.toHaveBeenCalled();
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
