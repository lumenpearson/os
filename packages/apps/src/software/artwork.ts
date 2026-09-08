/**
 * Store artwork, drawn rather than downloaded.
 *
 * A banner, a collection card and a screenshot carry a recipe — a shape, a
 * seed and a tone — instead of an image (see `store/FORMAT.md`). This module
 * turns a recipe into plain geometry inside one box; `Artwork.tsx` puts the
 * system's own colours on it. Keeping the two apart means the drawing is a
 * pure function of the recipe and can be tested for what matters: the same
 * seed always draws the same thing, and nothing lands outside the box.
 *
 * The randomness is a small deterministic generator, not `Math.random`: a
 * banner that redrew itself differently on every render would be noise.
 */

import type { Artwork } from './remote';

/** Every recipe is drawn in this box and sliced to whatever it is put in. */
export const ARTWORK_WIDTH = 120;
export const ARTWORK_HEIGHT = 60;

export type Figure =
  | { kind: 'ring'; cx: number; cy: number; r: number; width: number; opacity: number }
  | { kind: 'cell'; x: number; y: number; size: number; opacity: number }
  | { kind: 'bar'; x: number; y: number; width: number; height: number; opacity: number }
  | { kind: 'glyph'; x: number; y: number; size: number; text: string; opacity: number };

/** mulberry32: one multiply-shift generator, enough for placing rectangles. */
function generator(seed: number): () => number {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Two decimals: enough for a 120-unit box, and stable in a snapshot. */
function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function between(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

function rings(random: () => number): Figure[] {
  const cx = between(random, 34, 62);
  const cy = between(random, 24, 38);
  const count = 5 + Math.floor(random() * 3);
  const step = between(random, 7, 10);
  const figures: Figure[] = [];
  for (let i = 0; i < count; i += 1) {
    figures.push({
      kind: 'ring',
      cx: round(cx),
      cy: round(cy),
      r: round(step * (i + 1)),
      width: round(between(random, 0.6, 1.4)),
      opacity: round(Math.max(0.06, 0.32 - i * 0.04)),
    });
  }
  return figures;
}

function grid(random: () => number): Figure[] {
  const size = 8;
  const pitch = 10;
  const columns = ARTWORK_WIDTH / pitch;
  const rows = ARTWORK_HEIGHT / pitch;
  const figures: Figure[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const draw = random();
      if (draw < 0.55) continue;
      figures.push({
        kind: 'cell',
        x: column * pitch + (pitch - size) / 2,
        y: row * pitch + (pitch - size) / 2,
        size,
        opacity: round(0.08 + (draw - 0.55) * 0.5),
      });
    }
  }
  return figures;
}

function ramp(random: () => number): Figure[] {
  const count = 14;
  const pitch = ARTWORK_WIDTH / count;
  const width = pitch - 3;
  const figures: Figure[] = [];
  for (let i = 0; i < count; i += 1) {
    // A ramp: each bar takes its height from its place in the row, with a
    // little play so the edge is drawn rather than ruled.
    const base = ((i + 1) / count) * (ARTWORK_HEIGHT - 10);
    const height = round(Math.max(4, base + between(random, -6, 6)));
    figures.push({
      kind: 'bar',
      x: round(i * pitch + 1.5),
      y: round(ARTWORK_HEIGHT - height),
      width: round(width),
      height,
      opacity: round(0.1 + (i / count) * 0.22),
    });
  }
  return figures;
}

/**
 * Letterforms as texture. The alphabet is the one the OS sets values in, so a
 * typeface shelf is titled over the shapes of its own face.
 */
const GLYPHS = 'AaBbGgQRSkxy0123456789';

function type(random: () => number): Figure[] {
  const figures: Figure[] = [];
  const size = 20;
  for (let row = 0; row < 3; row += 1) {
    const y = 20 + row * 19;
    let x = between(random, 2, 10);
    while (x < ARTWORK_WIDTH) {
      const index = Math.floor(random() * GLYPHS.length);
      figures.push({
        kind: 'glyph',
        x: round(x),
        y,
        size,
        text: GLYPHS.charAt(index),
        opacity: round(between(random, 0.08, 0.26)),
      });
      x += between(random, 13, 20);
    }
  }
  return figures;
}

/** The geometry of one recipe, in the box. Same recipe, same figures. */
export function artworkFigures(artwork: Artwork): Figure[] {
  const random = generator(artwork.seed);
  switch (artwork.shape) {
    case 'rings':
      return rings(random);
    case 'grid':
      return grid(random);
    case 'ramp':
      return ramp(random);
    case 'type':
      return type(random);
  }
}

/** A sentence for a screen reader, since the drawing itself says nothing. */
export function describeArtwork(artwork: Artwork): string {
  const shape =
    artwork.shape === 'rings'
      ? 'concentric rings'
      : artwork.shape === 'grid'
        ? 'a grid of squares'
        : artwork.shape === 'ramp'
          ? 'a ramp of bars'
          : 'letterforms';
  return `Drawn artwork: ${shape}.`;
}
