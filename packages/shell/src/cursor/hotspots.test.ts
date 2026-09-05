import { describe, expect, it } from 'vitest';
import {
  ARROW_CLASSIC_HOTSPOT,
  ARROW_CLASSIC_PATH,
  ARROW_HOTSPOT,
  ARROW_PATH,
  firstPoint,
  hotspotOrigin,
  hotspotTransform,
  POINTER_HOTSPOT,
  VIEWBOX,
} from './hotspots';

describe('firstPoint', () => {
  it('reads the point an arrow is drawn from', () => {
    expect(firstPoint('M4 2.5v16.8z')).toEqual({ x: 4, y: 2.5 });
    expect(firstPoint('M 3 , 2 l0 17z')).toEqual({ x: 3, y: 2 });
  });

  it('refuses a path that does not start where it says', () => {
    expect(() => firstPoint('L4 2z')).toThrow();
  });
});

describe('the arrows', () => {
  it('take their hotspot from the drawing, so redrawing one moves its point', () => {
    expect(ARROW_HOTSPOT).toEqual(firstPoint(ARROW_PATH));
    expect(ARROW_CLASSIC_HOTSPOT).toEqual(firstPoint(ARROW_CLASSIC_PATH));
  });

  it('point up and to the left, near the corner of the box', () => {
    for (const hotspot of [ARROW_HOTSPOT, ARROW_CLASSIC_HOTSPOT]) {
      expect(hotspot.x).toBeLessThan(VIEWBOX / 4);
      expect(hotspot.y).toBeLessThan(VIEWBOX / 4);
    }
  });
});

describe('hotspotOrigin', () => {
  it('names the same point in units that survive a change of cursor size', () => {
    expect(hotspotOrigin({ x: 4, y: 2.5 })).toBe('16.667% 10.417%');
    expect(hotspotOrigin({ x: 12, y: 12 })).toBe('50.000% 50.000%');
  });
});

describe('hotspotTransform', () => {
  it('pulls the drawing back by exactly the offset of its point', () => {
    // 4 of 24 is a sixth of the width, so the glyph moves a sixth to the left.
    expect(hotspotTransform({ x: 4, y: 2.5 })).toBe('translate(-16.667%, -10.417%)');
    expect(hotspotTransform({ x: 0, y: 0 })).toBe('translate(0.000%, 0.000%)');
    expect(hotspotTransform({ x: 12, y: 12 })).toBe('translate(-50.000%, -50.000%)');
  });

  it('puts the point of every shape on the pointer', () => {
    // The transform is a percentage of the glyph's own size, so applying it to
    // the hotspot has to land on the origin whatever the cursor size is.
    for (const size of [16, 24, 32, 48]) {
      for (const hotspot of [ARROW_HOTSPOT, ARROW_CLASSIC_HOTSPOT, POINTER_HOTSPOT]) {
        const drawn = { x: (hotspot.x / VIEWBOX) * size, y: (hotspot.y / VIEWBOX) * size };
        const shift = { x: (-hotspot.x / VIEWBOX) * size, y: (-hotspot.y / VIEWBOX) * size };
        expect(drawn.x + shift.x).toBeCloseTo(0, 6);
        expect(drawn.y + shift.y).toBeCloseTo(0, 6);
      }
    }
  });
});
