import { describe, expect, it } from 'vitest';
import {
  ARTWORK_HEIGHT,
  ARTWORK_WIDTH,
  artworkFigures,
  describeArtwork,
  type Figure,
} from './artwork';
import { ARTWORK_SHAPES, type Artwork } from './remote';

function recipe(patch: Partial<Artwork> = {}): Artwork {
  return { shape: 'rings', seed: 7, tone: 'accent', ...patch };
}

function extent(figure: Figure): { left: number; right: number; top: number; bottom: number } {
  switch (figure.kind) {
    case 'ring':
      return {
        left: figure.cx - figure.r,
        right: figure.cx + figure.r,
        top: figure.cy - figure.r,
        bottom: figure.cy + figure.r,
      };
    case 'cell':
      return {
        left: figure.x,
        right: figure.x + figure.size,
        top: figure.y,
        bottom: figure.y + figure.size,
      };
    case 'bar':
      return {
        left: figure.x,
        right: figure.x + figure.width,
        top: figure.y,
        bottom: figure.y + figure.height,
      };
    case 'glyph':
      return {
        left: figure.x,
        right: figure.x + figure.size,
        top: figure.y - figure.size,
        bottom: figure.y,
      };
  }
}

describe('artworkFigures', () => {
  it('draws every shape the format defines', () => {
    for (const shape of ARTWORK_SHAPES) {
      expect(artworkFigures(recipe({ shape })).length, shape).toBeGreaterThan(2);
    }
  });

  it('draws the same figures for the same seed, every time', () => {
    for (const shape of ARTWORK_SHAPES) {
      const once = artworkFigures(recipe({ shape, seed: 22 }));
      const again = artworkFigures(recipe({ shape, seed: 22 }));
      expect(again, shape).toEqual(once);
    }
  });

  it('draws something else for another seed', () => {
    for (const shape of ARTWORK_SHAPES) {
      const a = artworkFigures(recipe({ shape, seed: 3 }));
      const b = artworkFigures(recipe({ shape, seed: 4 }));
      expect(b, shape).not.toEqual(a);
    }
  });

  it('ignores the tone: colour is put on afterwards, in the system tokens', () => {
    expect(artworkFigures(recipe({ tone: 'neutral' }))).toEqual(artworkFigures(recipe()));
  });

  it('keeps bars, cells and letters inside the box', () => {
    for (const shape of ['grid', 'ramp', 'type'] as const) {
      for (const figure of artworkFigures(recipe({ shape, seed: 91 }))) {
        const box = extent(figure);
        expect(box.left, shape).toBeGreaterThanOrEqual(0);
        expect(box.top, shape).toBeGreaterThanOrEqual(0);
        expect(box.bottom, shape).toBeLessThanOrEqual(ARTWORK_HEIGHT);
        if (figure.kind !== 'glyph') expect(box.right, shape).toBeLessThanOrEqual(ARTWORK_WIDTH);
      }
    }
  });

  it('stays quiet: nothing is drawn above a third opacity', () => {
    for (const shape of ARTWORK_SHAPES) {
      for (const figure of artworkFigures(recipe({ shape, seed: 55 }))) {
        expect(figure.opacity, shape).toBeLessThanOrEqual(0.34);
        expect(figure.opacity, shape).toBeGreaterThan(0);
      }
    }
  });

  it('survives a seed of zero', () => {
    expect(artworkFigures(recipe({ seed: 0 })).length).toBeGreaterThan(0);
  });
});

describe('describeArtwork', () => {
  it('names the shape for a screen reader', () => {
    expect(describeArtwork(recipe({ shape: 'grid' }))).toBe('Drawn artwork: a grid of squares.');
    expect(describeArtwork(recipe({ shape: 'type' }))).toBe('Drawn artwork: letterforms.');
  });
});
