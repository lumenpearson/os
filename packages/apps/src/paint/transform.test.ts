import { describe, expect, it } from 'vitest';
import {
  backingSize,
  clampDpr,
  clampPixel,
  clampScale,
  containsPixel,
  fitScale,
  fitView,
  gridLines,
  MAX_SCALE,
  MIN_SCALE,
  panBy,
  pixelCentre,
  settleView,
  shouldShowGrid,
  toImagePixel,
  toImagePoint,
  toScreenPoint,
  transformCss,
  type View,
  viewportCentre,
  visibleRect,
  zoomPercent,
  zoomStepIn,
  zoomStepOut,
  zoomTo,
} from './transform';

const viewport = { width: 800, height: 600 };
const image = { width: 1200, height: 900 };
const small = { width: 64, height: 48 };

describe('clampScale', () => {
  it('holds the 10 %–3200 % range', () => {
    expect(clampScale(0.01)).toBe(MIN_SCALE);
    expect(clampScale(100)).toBe(MAX_SCALE);
    expect(clampScale(2.5)).toBe(2.5);
  });

  it('falls back to the floor for nonsense', () => {
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
    expect(clampScale(0)).toBe(MIN_SCALE);
    expect(clampScale(-2)).toBe(MIN_SCALE);
  });
});

describe('clampDpr and backingSize', () => {
  it('keeps the ratio between 1 and 3', () => {
    expect(clampDpr(0)).toBe(1);
    expect(clampDpr(Number.NaN)).toBe(1);
    expect(clampDpr(1.5)).toBe(1.5);
    expect(clampDpr(4)).toBe(3);
  });

  it('sizes the backing store in whole device pixels', () => {
    expect(backingSize({ width: 100, height: 50 }, 2)).toEqual({ width: 200, height: 100 });
    expect(backingSize({ width: 100.4, height: 50.6 }, 1.5)).toEqual({ width: 151, height: 76 });
    expect(backingSize({ width: 0, height: 0 }, 2)).toEqual({ width: 1, height: 1 });
  });
});

describe('fitScale', () => {
  it('takes the tighter axis', () => {
    expect(fitScale(image, viewport)).toBeCloseTo(2 / 3);
  });

  it('never magnifies a small image', () => {
    expect(fitScale(small, viewport)).toBe(1);
  });

  it('survives a zero-sized image or viewport', () => {
    expect(fitScale({ width: 0, height: 0 }, viewport)).toBe(1);
    expect(fitScale(image, { width: 0, height: 0 })).toBe(1);
  });
});

describe('settleView', () => {
  it('centres an image smaller than the viewport', () => {
    const settled = settleView({ scale: 1, x: 999, y: -999 }, small, viewport);
    expect(settled.x).toBe((800 - 64) / 2);
    expect(settled.y).toBe((600 - 48) / 2);
  });

  it('will not let a large image be dragged past its own edge', () => {
    expect(settleView({ scale: 1, x: 40, y: 40 }, image, viewport).x).toBe(0);
    expect(settleView({ scale: 1, x: -9000, y: 0 }, image, viewport).x).toBe(800 - 1200);
    expect(settleView({ scale: 1, x: -100, y: -100 }, image, viewport)).toEqual({
      scale: 1,
      x: -100,
      y: -100,
    });
  });

  it('rounds the corner onto a device pixel', () => {
    const settled = settleView({ scale: 1, x: -100.4, y: -100.9 }, image, viewport, 2);
    expect(settled.x).toBe(-100.5);
    expect(settled.y).toBe(-101);
    const thirds = settleView({ scale: 1, x: -100.4, y: 0 }, image, viewport, 3);
    expect(thirds.x * 3).toBe(Math.round(thirds.x * 3));
  });
});

describe('fitView', () => {
  it('shows the whole image, centred, with room around it', () => {
    const view = fitView(image, viewport, 2);
    expect(view.scale).toBeCloseTo((600 - 24) / 900);
    expect(view.x).toBeCloseTo((800 - 1200 * view.scale) / 2, 1);
    expect(view.y).toBeCloseTo((600 - 900 * view.scale) / 2, 1);
  });
});

describe('the zoom ladder', () => {
  it('steps up and stops at the top', () => {
    expect(zoomStepIn(1)).toBe(1.5);
    expect(zoomStepIn(0.99)).toBe(1);
    expect(zoomStepIn(31)).toBe(MAX_SCALE);
    expect(zoomStepIn(MAX_SCALE)).toBe(MAX_SCALE);
  });

  it('steps down and stops at the bottom', () => {
    expect(zoomStepOut(1)).toBe(0.67);
    expect(zoomStepOut(0.1)).toBe(MIN_SCALE);
    expect(zoomStepOut(0.11)).toBe(MIN_SCALE);
  });

  it('reads as a whole percentage', () => {
    expect(zoomPercent(1)).toBe(100);
    expect(zoomPercent(32)).toBe(3200);
    expect(zoomPercent(0.125)).toBe(13);
  });
});

describe('zoomTo', () => {
  it('holds the pixel under the anchor still', () => {
    const start: View = settleView({ scale: 1, x: -200, y: -150 }, image, viewport, 2);
    const anchor = { x: 300, y: 220 };
    const before = toImagePoint(start, anchor);
    // Only while the image overflows the viewport: once it fits, settling
    // centres it and the anchor is no longer what decides where it sits.
    for (const scale of [1, 2, 4, 16, 32]) {
      const after = zoomTo(start, scale, anchor, image, viewport, 2);
      const now = toImagePoint(after, anchor);
      const tolerance = 0.5 / (2 * after.scale) + 1e-9;
      expect(Math.abs(now.x - before.x)).toBeLessThanOrEqual(tolerance);
      expect(Math.abs(now.y - before.y)).toBeLessThanOrEqual(tolerance);
    }
  });

  it('centres the image again once it fits the viewport', () => {
    const start = settleView({ scale: 4, x: -900, y: -700 }, image, viewport, 2);
    const out = zoomTo(start, 0.5, { x: 10, y: 10 }, image, viewport, 2);
    expect(out.x).toBe((800 - 600) / 2);
    expect(out.y).toBe((600 - 450) / 2);
  });

  it('clamps the scale it is given', () => {
    expect(
      zoomTo(fitView(image, viewport), 500, viewportCentre(viewport), image, viewport).scale,
    ).toBe(MAX_SCALE);
  });
});

describe('panBy', () => {
  it('moves and then re-clamps', () => {
    const start = settleView({ scale: 1, x: -100, y: -100 }, image, viewport);
    expect(panBy(start, 40, 0, image, viewport).x).toBe(-60);
    expect(panBy(start, 400, 0, image, viewport).x).toBe(0);
  });

  it('cannot move a centred image at all', () => {
    const start = settleView({ scale: 1, x: 0, y: 0 }, small, viewport);
    expect(panBy(start, 120, 90, small, viewport)).toEqual(start);
  });
});

// U+2194 names the round trip these tests check, in a test description that
// no user ever sees. It is not emoji and not product copy.
// deslop-ignore-next-line 15
describe('screen ↔ image', () => {
  const views: View[] = [
    { scale: 1, x: 0, y: 0 },
    { scale: 1, x: 12.5, y: -33 },
    { scale: 0.1, x: -4.75, y: 20.25 },
    { scale: 0.33, x: 7, y: 7 },
    { scale: 3, x: -101.5, y: -6 },
    { scale: 32, x: -4096, y: -2048 },
  ];

  it('is its own inverse on continuous coordinates', () => {
    for (const view of views) {
      for (const screen of [
        { x: 0, y: 0 },
        { x: 411.25, y: 96.5 },
        { x: 799, y: 599 },
      ]) {
        const back = toScreenPoint(view, toImagePoint(view, screen));
        expect(back.x).toBeCloseTo(screen.x, 6);
        expect(back.y).toBeCloseTo(screen.y, 6);
      }
    }
  });

  it('maps the centre of every pixel back to that pixel, at any zoom and any dpr', () => {
    for (const dpr of [1, 1.25, 1.5, 2, 3]) {
      for (const scale of [0.1, 0.33, 0.5, 1, 1.5, 3, 8, 32]) {
        const view = settleView({ scale, x: -37.3, y: -11.7 }, image, viewport, dpr);
        for (const px of [0, 1, 2, 37, 599, 1199]) {
          for (const py of [0, 3, 128, 899]) {
            const screen = toScreenPoint(view, pixelCentre({ x: px, y: py }));
            expect(toImagePixel(view, screen)).toEqual({ x: px, y: py });
          }
        }
      }
    }
  });

  it('puts the image origin on the first pixel and one step left outside it', () => {
    const view = settleView({ scale: 4, x: 0, y: 0 }, image, viewport, 2);
    expect(toImagePixel(view, toScreenPoint(view, { x: 0, y: 0 }))).toEqual({ x: 0, y: 0 });
    expect(toImagePixel(view, { x: view.x - 0.5, y: view.y - 0.5 })).toEqual({ x: -1, y: -1 });
    const lastPixel = { x: image.width - 1, y: image.height - 1 };
    expect(toImagePixel(view, toScreenPoint(view, pixelCentre(lastPixel)))).toEqual(lastPixel);
  });

  it('knows which pixels are on the image and pulls the rest back', () => {
    expect(containsPixel({ x: 0, y: 0 }, image)).toBe(true);
    expect(containsPixel({ x: 1200, y: 0 }, image)).toBe(false);
    expect(containsPixel({ x: -1, y: 4 }, image)).toBe(false);
    expect(clampPixel({ x: -5, y: 5000 }, image)).toEqual({ x: 0, y: 899 });
    expect(clampPixel({ x: 40, y: 40 }, image)).toEqual({ x: 40, y: 40 });
  });
});

describe('visibleRect', () => {
  it('is the whole image when it all fits', () => {
    const view = fitView(image, viewport);
    expect(visibleRect(view, image, viewport)).toEqual({
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  });

  it('narrows to the part on screen when zoomed in', () => {
    const view = settleView({ scale: 8, x: -400, y: -800 }, image, viewport);
    const box = visibleRect(view, image, viewport);
    expect(box.x).toBe(50);
    expect(box.y).toBe(100);
    expect(box.width).toBe(100);
    expect(box.height).toBe(75);
  });
});

describe('gridLines', () => {
  it('draws nothing until a pixel is eight screen pixels wide', () => {
    expect(shouldShowGrid(4)).toBe(false);
    expect(shouldShowGrid(8)).toBe(true);
    expect(gridLines({ scale: 4, x: 0, y: 0 }, image, viewport)).toEqual({ xs: [], ys: [] });
  });

  it('puts a line on every pixel boundary on screen', () => {
    const view = settleView({ scale: 10, x: -1000, y: -1000 }, image, viewport);
    const { xs, ys } = gridLines(view, image, viewport);
    expect(xs).toHaveLength(81);
    expect(ys).toHaveLength(61);
    expect(xs[0]).toBe(0);
    expect((xs[1] as number) - (xs[0] as number)).toBe(10);
  });

  it('stops at the edges of a small image instead of ruling the whole viewport', () => {
    const view = settleView({ scale: 10, x: 0, y: 0 }, small, viewport);
    const { xs } = gridLines(view, small, viewport);
    expect(xs).toHaveLength(small.width + 1);
    expect(xs[0]).toBe(view.x);
  });
});

describe('transformCss', () => {
  it('writes the same transform the maths assumes', () => {
    expect(transformCss({ scale: 2, x: -10, y: 5 })).toBe('translate(-10px, 5px) scale(2)');
  });
});
