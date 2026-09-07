import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { askAboutFrame, type FrameCase, forgetProbes, framePlan, readProbe } from './probe';

beforeEach(forgetProbes);
afterEach(() => vi.restoreAllMocks());

const answering = (body: unknown, status = 200) =>
  vi.fn(
    async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch;

describe('readProbe', () => {
  it('takes the three answers there are', () => {
    for (const frame of ['allowed', 'refused', 'unknown'] as const) {
      expect(readProbe({ frame, header: null, url: 'https://a.example/' }, '').frame).toBe(frame);
    }
  });

  it('treats anything else as nobody having answered', () => {
    for (const body of [null, 'a page', { frame: 'maybe' }, {}]) {
      expect(readProbe(body, 'https://a.example/').frame, JSON.stringify(body)).toBe('unknown');
    }
  });
});

describe('askAboutFrame', () => {
  it('asks the endpoint about the address it was given', async () => {
    const doFetch = answering({ frame: 'refused', header: 'X-Frame-Options: DENY', url: '' });
    const probe = await askAboutFrame('https://a.example/page', doFetch);
    expect(probe.frame).toBe('refused');
    expect(vi.mocked(doFetch).mock.calls[0]?.[0]).toBe(
      '/api/page?url=https%3A%2F%2Fa.example%2Fpage&probe=1',
    );
  });

  it('asks once per site, however many of its pages are opened', async () => {
    const doFetch = answering({ frame: 'refused', header: 'X-Frame-Options: DENY', url: '' });
    await askAboutFrame('https://a.example/one', doFetch);
    await askAboutFrame('https://a.example/two', doFetch);
    expect(vi.mocked(doFetch)).toHaveBeenCalledTimes(1);
  });

  it('asks again next time when nobody answered', async () => {
    const failing = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect((await askAboutFrame('https://a.example/', failing)).frame).toBe('unknown');
    await askAboutFrame('https://a.example/', failing);
    expect(vi.mocked(failing)).toHaveBeenCalledTimes(2);
  });

  it('is unknown when Lumen itself refuses the question', async () => {
    const probe = await askAboutFrame('https://a.example/', answering('no', 403));
    expect(probe.frame).toBe('unknown');
    expect(probe.problem).toContain('403');
  });
});

describe('framePlan', () => {
  const base: FrameCase = {
    external: false,
    relayed: false,
    refusedInAdvance: false,
    canRelay: true,
    verdict: null,
  };

  it('waits for the site’s answer before framing anything', () => {
    expect(framePlan(base)).toBe('asking');
  });

  it('frames a site that allows it and relays one that does not', () => {
    expect(framePlan({ ...base, verdict: 'allowed' })).toBe('direct');
    expect(framePlan({ ...base, verdict: 'refused' })).toBe('relay');
  });

  it('asks the site directly when nobody could answer', () => {
    expect(framePlan({ ...base, verdict: 'unknown' })).toBe('direct');
  });

  it('does not wait for an answer it could not act on', () => {
    // No relay — the desktop build, or the setting turned off — so the frame
    // is the only thing that can show the address and it gets it at once.
    expect(framePlan({ ...base, canRelay: false })).toBe('direct');
    expect(framePlan({ ...base, canRelay: false, verdict: 'refused' })).toBe('blocked');
  });

  it('keeps a page that is already relayed relayed', () => {
    expect(framePlan({ ...base, relayed: true, verdict: 'allowed' })).toBe('relay');
  });

  it('puts the list and the open-outside rule first', () => {
    expect(framePlan({ ...base, external: true })).toBe('outside');
    expect(framePlan({ ...base, refusedInAdvance: true })).toBe('relay');
    expect(framePlan({ ...base, refusedInAdvance: true, canRelay: false })).toBe('blocked');
  });
});
