import { describe, expect, it } from 'vitest';
import { type ScrollMetrics, scrollEdges } from './scrollEdges';

function metrics(over: Partial<ScrollMetrics> = {}): ScrollMetrics {
  return {
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 1000,
    scrollWidth: 1000,
    clientHeight: 400,
    clientWidth: 400,
    ...over,
  };
}

describe('scrollEdges', () => {
  it('shows nothing above a list at its start, and something below it', () => {
    expect(scrollEdges(metrics())).toEqual({ top: false, bottom: true, left: false, right: true });
  });

  it('shows both once it is somewhere in the middle', () => {
    const both = scrollEdges(metrics({ scrollTop: 300, scrollLeft: 300 }));
    expect(both).toEqual({ top: true, bottom: true, left: true, right: true });
  });

  it('drops the far edge at the end', () => {
    expect(scrollEdges(metrics({ scrollTop: 600, scrollLeft: 600 }))).toEqual({
      top: true,
      bottom: false,
      left: true,
      right: false,
    });
  });

  it('claims nothing at all when everything fits', () => {
    const fits = metrics({ scrollHeight: 400, scrollWidth: 400 });
    expect(scrollEdges(fits)).toEqual({ top: false, bottom: false, left: false, right: false });
  });

  it('does not leave a shadow hanging on a fractional scroll position', () => {
    /*
     * `scrollHeight` is a rounded integer and `scrollTop` is fractional at any
     * zoom but 100 %, so the sum at the true bottom lands a fraction short of
     * the whole. Compared exactly, every list at every scale would claim there
     * was more underneath it for ever.
     */
    expect(scrollEdges(metrics({ scrollTop: 599.6, clientHeight: 400 })).bottom).toBe(false);
    expect(scrollEdges(metrics({ scrollTop: 0.4 })).top).toBe(false);
  });

  it('reads a right-to-left scroller, where the start is zero or below', () => {
    // Firefox and Chromium both report a negative `scrollLeft` in RTL; the
    // distance from the start is what says whether anything is past the edge.
    expect(scrollEdges(metrics({ scrollLeft: -600 })).right).toBe(false);
    expect(scrollEdges(metrics({ scrollLeft: -300 })).right).toBe(true);
  });
});
