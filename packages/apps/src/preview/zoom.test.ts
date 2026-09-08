import { describe, expect, it } from 'vitest';
import {
  actualView,
  applyZoom,
  clampPan,
  clampScale,
  displayedSize,
  fitScale,
  fitView,
  flip,
  INITIAL_VIEW,
  MAX_SCALE,
  MIN_SCALE,
  normalizeRotation,
  panBy,
  rotateBy,
  rotatedSize,
  screenPoint,
  transformCss,
  type View,
  zoomIn,
  zoomOut,
  zoomPercent,
  zoomToward,
} from './zoom';

const viewport = { width: 800, height: 600 };
const photo = { width: 2000, height: 1000 };

const view = (patch: Partial<View> = {}): View => ({ ...INITIAL_VIEW, ...patch });

describe('rotatedSize', () => {
  it('leaves the box alone at 0° and 180°', () => {
    expect(rotatedSize(photo, 0)).toEqual({ width: 2000, height: 1000 });
    expect(rotatedSize(photo, 180)).toEqual({ width: 2000, height: 1000 });
  });

  it('swaps the axes at 90° and 270°', () => {
    expect(rotatedSize(photo, 90)).toEqual({ width: 1000, height: 2000 });
    expect(rotatedSize(photo, 270)).toEqual({ width: 1000, height: 2000 });
  });
});

describe('fitScale', () => {
  it('takes the tighter of the two axes', () => {
    // 800/2000 = 0.4 across, 600/1000 = 0.6 down.
    expect(fitScale(photo, viewport)).toBeCloseTo(0.4);
  });

  it('changes answer when the content is rotated', () => {
    // Rotated the box is 1000×2000: 800/1000 = 0.8 across, 600/2000 = 0.3 down.
    expect(fitScale(photo, viewport, 90)).toBeCloseTo(0.3);
  });

  it('leaves small content at its own size', () => {
    expect(fitScale({ width: 64, height: 64 }, viewport)).toBe(1);
  });

  it('fills the window when upscaling is allowed', () => {
    expect(fitScale({ width: 100, height: 100 }, viewport, 0, { allowUpscale: true })).toBeCloseTo(
      6,
    );
  });

  it('accounts for padding around the content', () => {
    expect(fitScale({ width: 400, height: 400 }, viewport, 0, { padding: 100 })).toBeCloseTo(1);
  });

  it('stays inside the zoom range and survives a zero-sized window', () => {
    expect(fitScale(photo, { width: 0, height: 0 })).toBe(1);
    expect(fitScale({ width: 0, height: 0 }, viewport)).toBe(1);
    expect(fitScale({ width: 100_000, height: 100_000 }, viewport)).toBeGreaterThanOrEqual(
      MIN_SCALE,
    );
  });
});

describe('the zoom ladder', () => {
  it('steps up and down between stops', () => {
    expect(zoomIn(1)).toBe(1.5);
    expect(zoomOut(1)).toBe(0.67);
    expect(zoomIn(0.42)).toBe(0.5);
    expect(zoomOut(0.42)).toBe(0.33);
  });

  it('stops at the ends of the range', () => {
    expect(zoomIn(MAX_SCALE)).toBe(MAX_SCALE);
    expect(zoomOut(MIN_SCALE)).toBe(MIN_SCALE);
    expect(zoomIn(50)).toBe(MAX_SCALE);
    expect(zoomOut(0.01)).toBe(MIN_SCALE);
  });

  it('clamps anything out of range, including nonsense', () => {
    expect(clampScale(0)).toBe(MIN_SCALE);
    expect(clampScale(-3)).toBe(MIN_SCALE);
    expect(clampScale(Number.NaN)).toBe(MIN_SCALE);
    expect(clampScale(1000)).toBe(MAX_SCALE);
    expect(clampScale(2.5)).toBe(2.5);
  });

  it('reports whole percentages', () => {
    expect(zoomPercent(0.333)).toBe(33);
    expect(zoomPercent(1)).toBe(100);
  });
});

describe('screenPoint', () => {
  it('places the content centre at the viewport centre', () => {
    expect(screenPoint(view(), viewport, { x: 0, y: 0 })).toEqual({ x: 400, y: 300 });
  });

  it('scales before rotating', () => {
    expect(screenPoint(view({ scale: 2 }), viewport, { x: 10, y: 0 })).toEqual({ x: 420, y: 300 });
  });

  it('turns the x axis into the y axis at 90°', () => {
    const at = screenPoint(view({ rotation: 90 }), viewport, { x: 100, y: 0 });
    expect(at.x).toBeCloseTo(400);
    expect(at.y).toBeCloseTo(400);
  });

  it('mirrors after rotating, so a flip is what the eye sees', () => {
    const at = screenPoint(view({ rotation: 90, flipY: true }), viewport, { x: 100, y: 0 });
    expect(at.x).toBeCloseTo(400);
    expect(at.y).toBeCloseTo(200);
  });

  it('adds the pan last', () => {
    expect(screenPoint(view({ x: 25, y: -40 }), viewport, { x: 0, y: 0 })).toEqual({
      x: 425,
      y: 260,
    });
  });
});

describe('zoomToward', () => {
  it('holds the pixel under the cursor still', () => {
    const before = view({ scale: 2, x: 30, y: -10, rotation: 90, flipX: true, fit: false });
    const point = { x: 120, y: -80 };
    const anchor = screenPoint(before, viewport, point);
    const after: View = { ...before, scale: 4, ...zoomToward(before, 4, anchor, viewport) };
    const moved = screenPoint(after, viewport, point);
    expect(moved.x).toBeCloseTo(anchor.x);
    expect(moved.y).toBeCloseTo(anchor.y);
  });

  it('holds it still when zooming out too', () => {
    const before = view({ scale: 3, x: -60, y: 45, fit: false });
    const point = { x: -30, y: 20 };
    const anchor = screenPoint(before, viewport, point);
    const after: View = { ...before, scale: 0.5, ...zoomToward(before, 0.5, anchor, viewport) };
    const moved = screenPoint(after, viewport, point);
    expect(moved.x).toBeCloseTo(anchor.x);
    expect(moved.y).toBeCloseTo(anchor.y);
  });

  it('keeps the content centred when the anchor is the centre', () => {
    expect(zoomToward(view(), 4, { x: 400, y: 300 }, viewport)).toEqual({ x: 0, y: 0 });
  });
});

describe('applyZoom', () => {
  const wide = { width: 4000, height: 4000 };

  it('keeps the cursor pixel still while the content overflows the window', () => {
    const before = view({ scale: 2, x: 30, y: -10, fit: false });
    const point = { x: 200, y: 150 };
    const anchor = screenPoint(before, viewport, point);
    const after = applyZoom(before, 4, anchor, wide, viewport);
    const moved = screenPoint(after, viewport, point);
    expect(moved.x).toBeCloseTo(anchor.x);
    expect(moved.y).toBeCloseTo(anchor.y);
    expect(after.fit).toBe(false);
  });

  it('re-centres content that no longer fills the window', () => {
    const after = applyZoom(view({ scale: 4, x: 200, fit: false }), 0.1, { x: 0, y: 0 }, wide, {
      width: 800,
      height: 600,
    });
    expect(after.x).toBe(0);
    expect(after.y).toBe(0);
  });

  it('refuses to leave the zoom range', () => {
    expect(applyZoom(view(), 900, { x: 0, y: 0 }, wide, viewport).scale).toBe(MAX_SCALE);
    expect(applyZoom(view(), 0.001, { x: 0, y: 0 }, wide, viewport).scale).toBe(MIN_SCALE);
  });
});

describe('clampPan', () => {
  it('centres content smaller than the window', () => {
    const state = view({ scale: 0.1, x: 400, y: 400, fit: false });
    expect(clampPan(state, photo, viewport)).toEqual({ x: 0, y: 0 });
  });

  it('stops the far edge from crossing the window edge', () => {
    // 2000×1000 at 100 % overflows by 1200×400, so half of that each way.
    const state = view({ scale: 1, x: 5000, y: -5000, fit: false });
    expect(clampPan(state, photo, viewport)).toEqual({ x: 600, y: -200 });
  });

  it('uses the rotated box, so a turned photo pans on the other axis', () => {
    const state = view({ scale: 1, rotation: 90, x: 5000, y: -5000, fit: false });
    expect(clampPan(state, photo, viewport)).toEqual({ x: 100, y: -700 });
  });

  it('leaves a pan inside the limits alone', () => {
    const state = view({ scale: 1, x: 40, y: -20, fit: false });
    expect(clampPan(state, photo, viewport)).toEqual({ x: 40, y: -20 });
  });
});

describe('panBy', () => {
  it('moves and then clamps in one step', () => {
    const state = view({ scale: 1, x: 590, y: 0, fit: false });
    expect(panBy(state, 100, 0, photo, viewport).x).toBe(600);
  });
});

describe('fitView, actualView and rotation', () => {
  it('fits and recentres', () => {
    const fitted = fitView(view({ scale: 4, x: 100, y: 100, fit: false }), photo, viewport);
    expect(fitted.scale).toBeCloseTo(0.4);
    expect(fitted).toMatchObject({ x: 0, y: 0, fit: true });
  });

  it('goes to 100 % and forgets the fit', () => {
    const actual = actualView(view({ scale: 0.4, x: 20, y: 20 }));
    expect(actual).toMatchObject({ scale: 1, x: 0, y: 0, fit: false });
  });

  it('re-fits after a rotation while the view follows the window', () => {
    const rotated = rotateBy(fitView(view(), photo, viewport), 90, photo, viewport);
    expect(rotated.rotation).toBe(90);
    expect(rotated.scale).toBeCloseTo(0.3);
  });

  it('keeps a user-chosen zoom through a rotation', () => {
    const rotated = rotateBy(view({ scale: 2, fit: false }), -90, photo, viewport);
    expect(rotated.rotation).toBe(270);
    expect(rotated.scale).toBe(2);
  });

  it('normalises the angle', () => {
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(450)).toBe(90);
  });

  it('toggles each mirror independently', () => {
    expect(flip(view(), 'x')).toMatchObject({ flipX: true, flipY: false });
    expect(flip(flip(view(), 'y'), 'y')).toMatchObject({ flipY: false });
  });
});

describe('transformCss', () => {
  it('writes the identity view as a plain translate and scale', () => {
    expect(transformCss(view())).toBe('translate(0px, 0px) scale(1)');
  });

  it('orders translate, mirror, rotation, scale', () => {
    expect(transformCss(view({ scale: 2, x: 10.125, y: -4, rotation: 90, flipX: true }))).toBe(
      'translate(10.13px, -4px) scale(-1, 1) rotate(90deg) scale(2)',
    );
  });
});

describe('displayedSize', () => {
  it('reports the box on screen', () => {
    expect(displayedSize(photo, view({ scale: 0.5 }))).toEqual({ width: 1000, height: 500 });
    expect(displayedSize(photo, view({ scale: 0.5, rotation: 270 }))).toEqual({
      width: 500,
      height: 1000,
    });
  });
});
