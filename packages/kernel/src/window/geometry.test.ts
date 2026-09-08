import { describe, expect, it } from 'vitest';
import {
  clampToArea,
  initialBounds,
  keepTitleVisible,
  resizeRect,
  snapRect,
  snapZoneAt,
} from './geometry';

const area = { x: 0, y: 26, width: 1280, height: 700 };

describe('window geometry', () => {
  it('clamps windows into the work area and shrinks oversized ones', () => {
    expect(clampToArea({ x: -50, y: 0, width: 400, height: 300 }, area)).toEqual({
      x: 0,
      y: 26,
      width: 400,
      height: 300,
    });
    expect(clampToArea({ x: 1200, y: 700, width: 400, height: 300 }, area)).toEqual({
      x: 880,
      y: 426,
      width: 400,
      height: 300,
    });
    const tiny = { x: 0, y: 0, width: 320, height: 240 };
    expect(clampToArea({ x: 0, y: 0, width: 2000, height: 2000 }, tiny)).toEqual({
      x: 0,
      y: 0,
      width: 320,
      height: 240,
    });
  });

  it('centres the first window and cascades the next', () => {
    const first = initialBounds({ width: 800, height: 500 }, area, []);
    expect(first.x).toBe(240);
    expect(first.width).toBe(800);
    const second = initialBounds({ width: 800, height: 500 }, area, [first]);
    expect(second.x).toBe(first.x + 28);
    expect(second.y).toBe(first.y + 28);
  });

  it('fits windows larger than a small screen', () => {
    const phone = { x: 0, y: 0, width: 360, height: 640 };
    const b = initialBounds({ width: 1000, height: 800 }, phone, []);
    expect(b.width).toBeLessThanOrEqual(360);
    expect(b.height).toBeLessThanOrEqual(640);
    expect(b.x).toBeGreaterThanOrEqual(0);
  });

  it('computes snap rects and zones', () => {
    expect(snapRect('left', area)).toEqual({ x: 0, y: 26, width: 640, height: 700 });
    expect(snapRect('right', area)).toEqual({ x: 640, y: 26, width: 640, height: 700 });
    expect(snapRect('top-right', area)).toEqual({ x: 640, y: 26, width: 640, height: 350 });
    expect(snapZoneAt(2, 300, area)).toBe('left');
    expect(snapZoneAt(1279, 300, area)).toBe('right');
    expect(snapZoneAt(640, 27, area)).toBe('top');
    expect(snapZoneAt(2, 30, area)).toBe('top-left');
    expect(snapZoneAt(1279, 720, area)).toBe('bottom-right');
    expect(snapZoneAt(640, 300, area)).toBeNull();
  });

  it('resizes from every handle within limits', () => {
    const r = { x: 100, y: 100, width: 400, height: 300 };
    expect(resizeRect(r, 'se', 50, 20)).toEqual({ x: 100, y: 100, width: 450, height: 320 });
    expect(resizeRect(r, 'nw', 50, 20)).toEqual({ x: 150, y: 120, width: 350, height: 280 });
    expect(resizeRect(r, 'w', 500, 0)).toEqual({ x: 180, y: 100, width: 320, height: 300 });
    expect(resizeRect(r, 'e', 5000, 0, undefined, { width: 600 })).toEqual({
      x: 100,
      y: 100,
      width: 600,
      height: 300,
    });
  });

  it('keeps a strip of the title bar reachable', () => {
    const r = keepTitleVisible({ x: -2000, y: -100, width: 400, height: 300 }, area);
    expect(r.x).toBe(-352);
    expect(r.y).toBe(26);
    const r2 = keepTitleVisible({ x: 3000, y: 3000, width: 400, height: 300 }, area);
    expect(r2.x).toBe(1232);
    expect(r2.y).toBe(690);
  });
});

describe('snapRect with a tiling gap', () => {
  const SIDES = [
    'left',
    'right',
    'top',
    'top-left',
    'top-right',
    'bottom-left',
    'bottom-right',
  ] as const;

  it('changes nothing at a gap of 0', () => {
    for (const side of SIDES) expect(snapRect(side, area, 0)).toEqual(snapRect(side, area));
  });

  it('keeps the gap from the edges and the same gap between neighbours', () => {
    const g = 12;
    const left = snapRect('left', area, g);
    const right = snapRect('right', area, g);
    expect(left.x).toBe(area.x + g);
    expect(left.y).toBe(area.y + g);
    expect(right.x - (left.x + left.width)).toBe(g);
    expect(right.x + right.width).toBe(area.x + area.width - g);
    expect(left.height).toBe(area.height - g * 2);
  });

  it('gives the four quarters the same gap vertically', () => {
    const g = 10;
    const tl = snapRect('top-left', area, g);
    const bl = snapRect('bottom-left', area, g);
    expect(bl.y - (tl.y + tl.height)).toBe(g);
    expect(bl.y + bl.height).toBe(area.y + area.height - g);
    expect(tl.width).toBe(snapRect('bottom-left', area, g).width);
  });

  it('leaves no space unaccounted for: two halves plus the gaps fill the area', () => {
    for (const g of [0, 1, 7, 16, 33]) {
      const left = snapRect('left', area, g);
      const right = snapRect('right', area, g);
      expect(left.width + right.width + g * 3).toBe(area.width);
    }
  });

  it('never inverts a tile, however large the gap asked for', () => {
    for (const g of [100, 1000, 10_000]) {
      for (const side of SIDES) {
        const r = snapRect(side, area, g);
        expect(r.width).toBeGreaterThan(0);
        expect(r.height).toBeGreaterThan(0);
      }
    }
  });

  it('ignores a negative gap rather than growing the tiles', () => {
    expect(snapRect('left', area, -20)).toEqual(snapRect('left', area, 0));
  });
});
