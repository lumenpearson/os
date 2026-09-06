import type { Rect, SnapSide, WindowOptions } from '../types';

export interface Size {
  width: number;
  height: number;
}

export type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export const DEFAULT_MIN: Size = { width: 320, height: 200 };

/** Keep a window inside the work area; shrink it if the area is smaller than the window. */
export function clampToArea(rect: Rect, area: Rect, min: Size = DEFAULT_MIN): Rect {
  const width = Math.max(Math.min(rect.width, area.width), Math.min(min.width, area.width));
  const height = Math.max(Math.min(rect.height, area.height), Math.min(min.height, area.height));
  const x = Math.min(Math.max(rect.x, area.x), area.x + area.width - width);
  const y = Math.min(Math.max(rect.y, area.y), area.y + area.height - height);
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** Fit requested window options into the area: centred, or cascaded after existing windows. */
export function initialBounds(options: WindowOptions, area: Rect, existing: Rect[]): Rect {
  const width = Math.min(options.width, area.width - 16);
  const height = Math.min(options.height, area.height - 16);
  if (options.x !== undefined && options.y !== undefined) {
    return clampToArea({ x: options.x, y: options.y, width, height }, area);
  }
  const centre = {
    x: area.x + (area.width - width) / 2,
    y: area.y + (area.height - height) / 2 - Math.min(24, area.height * 0.03),
    width,
    height,
  };
  if (options.centered || existing.length === 0) return clampToArea(centre, area);
  // cascade from the top-most existing window
  const last = existing[existing.length - 1] as Rect;
  const step = 28;
  let candidate = { x: last.x + step, y: last.y + step, width, height };
  if (candidate.x + width > area.x + area.width || candidate.y + height > area.y + area.height) {
    candidate = { x: area.x + 40, y: area.y + 40, width, height };
  }
  return clampToArea(candidate, area);
}

/**
 * The rectangle a window takes when it is tiled to `side`.
 *
 * `gap` is Settings > Windows > "Gap between tiled windows": the margin the
 * tiles keep from the edges of the work area and from each other. It is one
 * number for both, so two tiles side by side are separated by exactly the
 * distance each keeps from the screen edge, and at 0 — the default — the
 * arithmetic is the same as it was before gaps existed.
 */
export function snapRect(side: SnapSide, area: Rect, gap = 0): Rect {
  // A gap wider than the area would invert the tiles. Cap it well below that.
  const g = Math.max(
    0,
    Math.min(Math.round(gap), Math.floor(Math.min(area.width, area.height) / 6)),
  );
  const inner: Rect = {
    x: area.x + g,
    y: area.y + g,
    width: area.width - g * 2,
    height: area.height - g * 2,
  };
  const half = Math.round((inner.width - g) / 2);
  const halfH = Math.round((inner.height - g) / 2);
  const right = inner.x + half + g;
  const bottom = inner.y + halfH + g;
  const restW = inner.width - half - g;
  const restH = inner.height - halfH - g;
  switch (side) {
    case 'left':
      return { x: inner.x, y: inner.y, width: half, height: inner.height };
    case 'right':
      return { x: right, y: inner.y, width: restW, height: inner.height };
    case 'top':
      return { ...inner };
    case 'top-left':
      return { x: inner.x, y: inner.y, width: half, height: halfH };
    case 'top-right':
      return { x: right, y: inner.y, width: restW, height: halfH };
    case 'bottom-left':
      return { x: inner.x, y: bottom, width: half, height: restH };
    case 'bottom-right':
      return { x: right, y: bottom, width: restW, height: restH };
  }
}

/** Which snap zone (if any) the pointer is in while dragging. */
export function snapZoneAt(px: number, py: number, area: Rect, threshold = 12): SnapSide | null {
  const nearLeft = px <= area.x + threshold;
  const nearRight = px >= area.x + area.width - threshold;
  const nearTop = py <= area.y + threshold;
  const nearBottom = py >= area.y + area.height - threshold;
  const corner = Math.max(threshold * 6, 80);
  if (nearLeft && py <= area.y + corner) return 'top-left';
  if (nearRight && py <= area.y + corner) return 'top-right';
  if (nearLeft && py >= area.y + area.height - corner) return 'bottom-left';
  if (nearRight && py >= area.y + area.height - corner) return 'bottom-right';
  if (nearLeft) return 'left';
  if (nearRight) return 'right';
  if (nearTop) return 'top';
  if (nearBottom) return null;
  return null;
}

export function resizeRect(
  rect: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  min: Size = DEFAULT_MIN,
  max?: Partial<Size>,
): Rect {
  let { x, y, width, height } = rect;
  const maxW = max?.width ?? Number.POSITIVE_INFINITY;
  const maxH = max?.height ?? Number.POSITIVE_INFINITY;
  if (handle.includes('e')) width = clamp(rect.width + dx, min.width, maxW);
  if (handle.includes('s')) height = clamp(rect.height + dy, min.height, maxH);
  if (handle.includes('w')) {
    width = clamp(rect.width - dx, min.width, maxW);
    x = rect.x + (rect.width - width);
  }
  if (handle.includes('n')) {
    height = clamp(rect.height - dy, min.height, maxH);
    y = rect.y + (rect.height - height);
  }
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

export function moveRect(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: Math.round(rect.x + dx), y: Math.round(rect.y + dy) };
}

/** Keep at least a grab-able strip of the title bar visible after a move. */
export function keepTitleVisible(rect: Rect, area: Rect, titleHeight = 36, margin = 48): Rect {
  const minX = area.x - rect.width + margin;
  const maxX = area.x + area.width - margin;
  const minY = area.y;
  const maxY = area.y + area.height - titleHeight;
  return {
    ...rect,
    x: Math.round(clamp(rect.x, minX, maxX)),
    y: Math.round(clamp(rect.y, minY, maxY)),
  };
}

export function rectsEqual(a: Rect, b: Rect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function centerOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** A rect scaled around its centre by `factor`, for open/close animations. */
export function scaleRect(rect: Rect, factor: number): Rect {
  const c = centerOf(rect);
  const width = rect.width * factor;
  const height = rect.height * factor;
  return { x: c.x - width / 2, y: c.y - height / 2, width, height };
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
