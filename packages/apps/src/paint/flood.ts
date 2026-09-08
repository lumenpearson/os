/**
 * The paint bucket: a scanline flood fill over a raw RGBA buffer.
 *
 * It works on anything shaped like `ImageData`, so the app hands it the real
 * one from the canvas and the tests hand it a buffer built by hand. Filled
 * pixels are written, not blended — a bucket of half-transparent red leaves
 * half-transparent red behind, which is what a bucket is for.
 *
 * Every pixel is marked visited as it is written, so a fill colour that is
 * itself within tolerance of the target cannot send the walk round again.
 */

import { clampChannel, type Rgba } from './colour';
import type { Point, Rect } from './geometry';

export interface Bitmap {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** The largest single-channel difference, alpha included: 0–255. */
export function colourDistance(a: Rgba, b: Rgba): number {
  return Math.max(
    Math.abs(a.r - b.r),
    Math.abs(a.g - b.g),
    Math.abs(a.b - b.b),
    Math.abs(a.a - b.a),
  );
}

/** The colour at a pixel, or null outside the image (the eyedropper's read). */
export function sampleAt(bitmap: Bitmap, p: Point): Rgba | null {
  const x = Math.floor(p.x);
  const y = Math.floor(p.y);
  if (x < 0 || y < 0 || x >= bitmap.width || y >= bitmap.height) return null;
  const i = (y * bitmap.width + x) * 4;
  return {
    r: bitmap.data[i] ?? 0,
    g: bitmap.data[i + 1] ?? 0,
    b: bitmap.data[i + 2] ?? 0,
    a: bitmap.data[i + 3] ?? 0,
  };
}

function write(bitmap: Bitmap, index: number, colour: Rgba): void {
  bitmap.data[index] = clampChannel(colour.r);
  bitmap.data[index + 1] = clampChannel(colour.g);
  bitmap.data[index + 2] = clampChannel(colour.b);
  bitmap.data[index + 3] = clampChannel(colour.a);
}

/**
 * Fill the region of like-coloured pixels around `start`. Mutates `bitmap` and
 * returns the box that changed, or null if nothing did.
 *
 * `tolerance` is 0–255 and inclusive: a pixel exactly `tolerance` away from
 * the colour under the cursor is part of the region.
 */
export function floodFill(bitmap: Bitmap, start: Point, fill: Rgba, tolerance = 0): Rect | null {
  const { width, height } = bitmap;
  const target = sampleAt(bitmap, start);
  if (!target) return null;
  if (colourDistance(target, fill) === 0) return null;
  const limit = Math.max(0, Math.min(255, tolerance));

  const visited = new Uint8Array(width * height);
  const matches = (x: number, y: number): boolean => {
    const at = sampleAt(bitmap, { x, y });
    return at !== null && colourDistance(at, target) <= limit;
  };

  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  const stack: Point[] = [{ x: Math.floor(start.x), y: Math.floor(start.y) }];
  while (stack.length > 0) {
    const seed = stack.pop();
    if (!seed) break;
    const { y } = seed;
    if (visited[y * width + seed.x] === 1 || !matches(seed.x, y)) continue;

    let left = seed.x;
    while (left > 0 && visited[y * width + left - 1] !== 1 && matches(left - 1, y)) left--;
    let right = seed.x;
    while (right < width - 1 && visited[y * width + right + 1] !== 1 && matches(right + 1, y)) {
      right++;
    }

    for (let x = left; x <= right; x++) {
      visited[y * width + x] = 1;
      write(bitmap, (y * width + x) * 4, fill);
    }
    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;

    for (const row of [y - 1, y + 1]) {
      if (row < 0 || row >= height) continue;
      let running = false;
      for (let x = left; x <= right; x++) {
        const open = visited[row * width + x] !== 1 && matches(x, row);
        if (open && !running) stack.push({ x, y: row });
        running = open;
      }
    }
  }

  if (maxX < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}
