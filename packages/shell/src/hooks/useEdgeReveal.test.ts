import { describe, expect, it } from 'vitest';
import { edgeDistance, HIDE_AT, REVEAL_BAND } from './useEdgeReveal';

describe('edgeDistance', () => {
  const w = 1000;
  const h = 800;

  it('measures from the edge it is asked about', () => {
    expect(edgeDistance('top', 500, 3, w, h)).toBe(3);
    expect(edgeDistance('bottom', 500, 795, w, h)).toBe(5);
    expect(edgeDistance('left', 2, 400, w, h)).toBe(2);
    expect(edgeDistance('right', 996, 400, w, h)).toBe(4);
  });

  it('gives the reveal band something to compare against', () => {
    // Touching the edge reveals; the middle of the screen does not.
    expect(edgeDistance('top', 0, 0, w, h)).toBeLessThanOrEqual(REVEAL_BAND);
    expect(edgeDistance('top', 500, 400, w, h)).toBeGreaterThan(HIDE_AT);
  });

  it('hides only well past the panel, so the panel does not flicker', () => {
    expect(HIDE_AT).toBeGreaterThan(REVEAL_BAND);
  });
});
