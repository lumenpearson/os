/**
 * What the app remembers between sessions, in `~/.config/paint.json`.
 * Everything read back is treated as unknown until it has been checked: the
 * file is a text file a user can edit.
 */

import { formatHex, parseHex, RECENT_LIMIT } from './colour';
import { clampDimension, DEFAULT_CANVAS } from './document';
import type { Size } from './geometry';
import { DEFAULT_TOOL, isToolId, type ShapeStyle, type ToolId } from './tools';

export const MIN_BRUSH = 1;
export const MAX_BRUSH = 64;
export const MIN_TEXT = 8;
export const MAX_TEXT = 200;

export interface PaintPrefs {
  tool: ToolId;
  /** Hex, as typed into the colour field. */
  foreground: string;
  background: string;
  brushSize: number;
  /** 0 is a fully soft edge, 1 a hard one. */
  hardness: number;
  /** Flood fill tolerance, 0–255. */
  tolerance: number;
  textSize: number;
  shapeStyle: ShapeStyle;
  showGrid: boolean;
  recent: string[];
  /** The size a new document starts at. */
  canvas: Size;
}

export const DEFAULT_PREFS: PaintPrefs = {
  tool: DEFAULT_TOOL,
  foreground: '#1f2126',
  background: '#ffffff',
  brushSize: 4,
  hardness: 0.8,
  tolerance: 16,
  textSize: 24,
  shapeStyle: 'stroke',
  showGrid: true,
  recent: [],
  canvas: DEFAULT_CANVAS,
};

const record = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

function number(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function colour(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const parsed = parseHex(value);
  return parsed ? formatHex(parsed) : fallback;
}

function shapeStyle(value: unknown): ShapeStyle {
  return value === 'fill' || value === 'both' || value === 'stroke'
    ? value
    : DEFAULT_PREFS.shapeStyle;
}

export function normalizePrefs(value: unknown): PaintPrefs {
  const raw = record(value);
  const canvas = record(raw.canvas);
  const recent = Array.isArray(raw.recent) ? raw.recent : [];
  return {
    tool: isToolId(raw.tool) ? raw.tool : DEFAULT_PREFS.tool,
    foreground: colour(raw.foreground, DEFAULT_PREFS.foreground),
    background: colour(raw.background, DEFAULT_PREFS.background),
    brushSize: Math.round(number(raw.brushSize, DEFAULT_PREFS.brushSize, MIN_BRUSH, MAX_BRUSH)),
    hardness: number(raw.hardness, DEFAULT_PREFS.hardness, 0, 1),
    tolerance: Math.round(number(raw.tolerance, DEFAULT_PREFS.tolerance, 0, 255)),
    textSize: Math.round(number(raw.textSize, DEFAULT_PREFS.textSize, MIN_TEXT, MAX_TEXT)),
    shapeStyle: shapeStyle(raw.shapeStyle),
    showGrid: typeof raw.showGrid === 'boolean' ? raw.showGrid : DEFAULT_PREFS.showGrid,
    recent: recent
      .filter((entry): entry is string => typeof entry === 'string')
      .map((entry) => parseHex(entry))
      .filter((parsed): parsed is NonNullable<typeof parsed> => parsed !== null)
      .map(formatHex)
      .slice(0, RECENT_LIMIT),
    canvas: {
      width: clampDimension(typeof canvas.width === 'number' ? canvas.width : DEFAULT_CANVAS.width),
      height: clampDimension(
        typeof canvas.height === 'number' ? canvas.height : DEFAULT_CANVAS.height,
      ),
    },
  };
}
