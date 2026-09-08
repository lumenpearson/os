import { describe, expect, it } from 'vitest';
import { type IconBox, marqueeRect, sameSelection, touchesBox } from './marquee';

/** An icon-sized box, the way the desktop lays them out. */
const box = (x: number, y: number): IconBox['box'] => ({ x, y, width: 96, height: 108 });

describe('marqueeRect', () => {
  it('spans the two corners of a drag down and to the right', () => {
    expect(marqueeRect({ x: 10, y: 20 }, { x: 110, y: 220 })).toEqual({
      x: 10,
      y: 20,
      width: 100,
      height: 200,
    });
  });

  it('gives the same rectangle for a drag up and to the left', () => {
    const down = marqueeRect({ x: 10, y: 20 }, { x: 110, y: 220 });
    expect(marqueeRect({ x: 110, y: 220 }, { x: 10, y: 20 })).toEqual(down);
  });

  it('normalises a drag that crosses the anchor on one axis only', () => {
    expect(marqueeRect({ x: 100, y: 20 }, { x: 40, y: 90 })).toEqual({
      x: 40,
      y: 20,
      width: 60,
      height: 70,
    });
  });

  it('spans nothing when the pointer never moved', () => {
    expect(marqueeRect({ x: 42, y: 42 }, { x: 42, y: 42 })).toEqual({
      x: 42,
      y: 42,
      width: 0,
      height: 0,
    });
  });
});

describe('touchesBox', () => {
  const icon = box(100, 100);

  it('touches a box it overlaps by a corner', () => {
    expect(touchesBox({ x: 60, y: 60, width: 50, height: 50 }, icon)).toBe(true);
  });

  it('touches a box it covers completely', () => {
    expect(touchesBox({ x: 0, y: 0, width: 400, height: 400 }, icon)).toBe(true);
  });

  it('touches a box that covers it completely', () => {
    expect(touchesBox({ x: 120, y: 120, width: 10, height: 10 }, icon)).toBe(true);
  });

  it('misses a box it stops short of on either axis', () => {
    expect(touchesBox({ x: 0, y: 100, width: 90, height: 50 }, icon)).toBe(false);
    expect(touchesBox({ x: 100, y: 0, width: 50, height: 90 }, icon)).toBe(false);
  });

  it('misses a box whose edge it only meets', () => {
    expect(touchesBox({ x: 0, y: 100, width: 100, height: 50 }, icon)).toBe(false);
    expect(touchesBox({ x: 196, y: 100, width: 50, height: 50 }, icon)).toBe(false);
  });

  it('selects nothing from a zero-size drag on empty desktop', () => {
    const nothing = marqueeRect({ x: 40, y: 40 }, { x: 40, y: 40 });
    expect(touchesBox(nothing, icon)).toBe(false);
  });

  it('touches the box a zero-size drag sits inside', () => {
    const nothing = marqueeRect({ x: 140, y: 140 }, { x: 140, y: 140 });
    expect(touchesBox(nothing, icon)).toBe(true);
  });

  it('picks the icons a drag up and to the left crossed, and no others', () => {
    const icons: IconBox[] = [
      { path: '/Desktop/a', box: box(0, 0) },
      { path: '/Desktop/b', box: box(0, 108) },
      { path: '/Desktop/c', box: box(96, 0) },
    ];
    const rect = marqueeRect({ x: 150, y: 150 }, { x: 50, y: 50 });
    expect(icons.filter((i) => touchesBox(rect, i.box)).map((i) => i.path)).toEqual([
      '/Desktop/a',
      '/Desktop/b',
      '/Desktop/c',
    ]);
  });
});

describe('sameSelection', () => {
  it('holds for the same paths in a different order', () => {
    expect(sameSelection(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true);
  });

  it('holds for a set compared with itself', () => {
    const one = new Set(['a']);
    expect(sameSelection(one, one)).toBe(true);
  });

  it('fails when a path was added or swapped', () => {
    expect(sameSelection(new Set(['a']), new Set(['a', 'b']))).toBe(false);
    expect(sameSelection(new Set(['a', 'b']), new Set(['a', 'c']))).toBe(false);
  });

  it('holds for two empty selections', () => {
    expect(sameSelection(new Set(), new Set())).toBe(true);
  });
});
