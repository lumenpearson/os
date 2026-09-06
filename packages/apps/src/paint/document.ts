/**
 * Document arithmetic: the sizes, anchors and names the Image menu and the
 * canvas-size dialog work in. None of it touches a canvas.
 */

import { basename, extname } from '@lumen/vfs';
import type { Point, Size } from './geometry';

/** Where the old image sits inside a resized canvas. */
export type Anchor =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'left'
  | 'centre'
  | 'right'
  | 'bottom-left'
  | 'bottom'
  | 'bottom-right';

/** Reading order, which is also the order the nine anchor buttons are drawn in. */
export const ANCHORS: readonly Anchor[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'centre',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
] as const;

export const MIN_DIMENSION = 1;
export const MAX_DIMENSION = 8192;

/** A new document, and the fallback when a stored size makes no sense. */
export const DEFAULT_CANVAS: Size = { width: 800, height: 600 };

export function clampDimension(value: number): number {
  if (!Number.isFinite(value)) return MIN_DIMENSION;
  return Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, Math.round(value)));
}

export function clampSize(size: Size): Size {
  return { width: clampDimension(size.width), height: clampDimension(size.height) };
}

/** A dimension field: whole pixels, or null while the field is unusable. */
export function parseDimension(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  if (value < MIN_DIMENSION || value > MAX_DIMENSION) return null;
  return value;
}

/** Top-left corner for the old image inside the new canvas; may be negative when cropping. */
export function anchorOffset(anchor: Anchor, from: Size, to: Size): Point {
  const dx = to.width - from.width;
  const dy = to.height - from.height;
  const left = anchor === 'top-left' || anchor === 'left' || anchor === 'bottom-left';
  const right = anchor === 'top-right' || anchor === 'right' || anchor === 'bottom-right';
  const top = anchor === 'top-left' || anchor === 'top' || anchor === 'top-right';
  const bottom = anchor === 'bottom-left' || anchor === 'bottom' || anchor === 'bottom-right';
  return {
    x: left ? 0 : right ? dx : Math.round(dx / 2),
    y: top ? 0 : bottom ? dy : Math.round(dy / 2),
  };
}

/** With the ratio locked, the edited side decides the other one. */
export function linkDimensions(original: Size, next: Size, edited: 'width' | 'height'): Size {
  if (original.width <= 0 || original.height <= 0) return clampSize(next);
  if (edited === 'width') {
    const width = clampDimension(next.width);
    return { width, height: clampDimension((width * original.height) / original.width) };
  }
  const height = clampDimension(next.height);
  return { width: clampDimension((height * original.width) / original.height), height };
}

export function scaleByPercent(original: Size, percent: number): Size {
  const factor = Number.isFinite(percent) ? Math.max(1, percent) / 100 : 1;
  return clampSize({ width: original.width * factor, height: original.height * factor });
}

export function rotatedSize(size: Size, quarterTurns: number): Size {
  const turns = ((Math.round(quarterTurns) % 4) + 4) % 4;
  return turns % 2 === 0 ? { ...size } : { width: size.height, height: size.width };
}

export function sameSize(a: Size, b: Size): boolean {
  return a.width === b.width && a.height === b.height;
}

/** Bytes an RGBA snapshot of this size occupies. */
export function pixelBytes(size: Size): number {
  return size.width * size.height * 4;
}

/**
 * Where Save writes. The document is a bitmap and this app only encodes PNG,
 * so opening a JPEG and saving writes the PNG beside it rather than quietly
 * re-encoding into a format the canvas cannot round-trip.
 */
export function pngPath(path: string): string {
  const ext = extname(path);
  if (ext.toLowerCase() === '.png') return path;
  return `${path.slice(0, path.length - ext.length)}.png`;
}

export function isPng(path: string): boolean {
  return extname(path).toLowerCase() === '.png';
}

/** The name in the title bar. */
export function documentName(path: string | null): string {
  return path === null ? 'Untitled' : basename(path);
}

/** macOS says "Edited" in the title while a document has unsaved changes. */
export function documentTitle(path: string | null, dirty: boolean): string {
  return dirty ? `${documentName(path)} — Edited` : documentName(path);
}

export function formatSize(size: Size): string {
  return `${size.width} × ${size.height}`;
}
