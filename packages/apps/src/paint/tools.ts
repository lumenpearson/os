/**
 * The tools, in palette order, and the options each one shows.
 *
 * Filled shapes are a style on the shape tools rather than three more tools:
 * the choice is between the outline, the fill and both, and a tool palette
 * with "Rectangle" and "Filled Rectangle" side by side hides that.
 */

import {
  Brush,
  Circle,
  Eraser,
  type LucideIcon,
  PaintBucket,
  Pencil,
  Pipette,
  Slash,
  Square,
  SquareDashed,
  Type,
} from 'lucide-react';

export type ToolId =
  | 'pencil'
  | 'brush'
  | 'eraser'
  | 'fill'
  | 'eyedropper'
  | 'line'
  | 'rectangle'
  | 'ellipse'
  | 'text'
  | 'select';

/** What the outline and the fill of a shape are drawn with. */
export type ShapeStyle = 'stroke' | 'fill' | 'both';

export type ToolOption = 'size' | 'hardness' | 'tolerance' | 'shape' | 'text';

export interface ToolSpec {
  id: ToolId;
  label: string;
  /** Selects the tool while the canvas has focus. */
  key: string;
  glyph: LucideIcon;
  options: readonly ToolOption[];
  /** CSS cursor over the canvas. */
  cursor: string;
  /** One line in the tooltip, saying what the tool does. */
  hint: string;
}

export const DEFAULT_TOOL: ToolId = 'pencil';

export const TOOL_ORDER: readonly ToolId[] = [
  'pencil',
  'brush',
  'eraser',
  'fill',
  'eyedropper',
  'line',
  'rectangle',
  'ellipse',
  'text',
  'select',
] as const;

export const TOOL_SPECS: Record<ToolId, ToolSpec> = {
  pencil: {
    id: 'pencil',
    label: 'Pencil',
    key: 'p',
    glyph: Pencil,
    options: ['size'],
    cursor: 'crosshair',
    hint: 'Hard-edged freehand.',
  },
  brush: {
    id: 'brush',
    label: 'Brush',
    key: 'b',
    glyph: Brush,
    options: ['size', 'hardness'],
    cursor: 'crosshair',
    hint: 'Freehand with a soft edge.',
  },
  eraser: {
    id: 'eraser',
    label: 'Eraser',
    key: 'e',
    glyph: Eraser,
    options: ['size'],
    cursor: 'crosshair',
    hint: 'Clears back to transparency.',
  },
  fill: {
    id: 'fill',
    label: 'Fill',
    key: 'g',
    glyph: PaintBucket,
    options: ['tolerance'],
    // The pixel under the pointer chooses the region, but the region is what
    // changes: `cell` says area where the crosshair would promise a point.
    cursor: 'cell',
    hint: 'Floods the region under the cursor.',
  },
  eyedropper: {
    id: 'eyedropper',
    label: 'Eyedropper',
    key: 'i',
    glyph: Pipette,
    options: [],
    cursor: 'crosshair',
    hint: 'Picks up the colour under the cursor.',
  },
  line: {
    id: 'line',
    label: 'Line',
    key: 'l',
    glyph: Slash,
    options: ['size'],
    cursor: 'crosshair',
    hint: 'Shift holds it to 15°.',
  },
  rectangle: {
    id: 'rectangle',
    label: 'Rectangle',
    key: 'r',
    glyph: Square,
    options: ['size', 'shape'],
    cursor: 'crosshair',
    hint: 'Shift for a square, Alt from the centre.',
  },
  ellipse: {
    id: 'ellipse',
    label: 'Ellipse',
    key: 'o',
    glyph: Circle,
    options: ['size', 'shape'],
    cursor: 'crosshair',
    hint: 'Shift for a circle, Alt from the centre.',
  },
  text: {
    id: 'text',
    label: 'Text',
    key: 't',
    glyph: Type,
    options: ['text'],
    cursor: 'text',
    hint: 'Click, type, Enter to draw it in.',
  },
  select: {
    id: 'select',
    label: 'Select',
    key: 'm',
    glyph: SquareDashed,
    options: [],
    cursor: 'crosshair',
    hint: 'Drag a box, then drag it again to move.',
  },
};

export const TOOLS: readonly ToolSpec[] = TOOL_ORDER.map((id) => TOOL_SPECS[id]);

export function toolSpec(id: ToolId): ToolSpec {
  return TOOL_SPECS[id];
}

/** The tool a single key press selects, if any. */
export function toolForKey(key: string): ToolId | null {
  const wanted = key.toLowerCase();
  return TOOL_ORDER.find((id) => TOOL_SPECS[id].key === wanted) ?? null;
}

export function usesOption(id: ToolId, option: ToolOption): boolean {
  return TOOL_SPECS[id].options.includes(option);
}

/** Tools dragged out from a start point, previewed until the pointer is up. */
export function isShapeTool(id: ToolId): boolean {
  return id === 'line' || id === 'rectangle' || id === 'ellipse';
}

/** Tools that lay down pixels continuously as the pointer moves. */
export function isFreehandTool(id: ToolId): boolean {
  return id === 'pencil' || id === 'brush' || id === 'eraser';
}

export function isToolId(value: unknown): value is ToolId {
  return typeof value === 'string' && value in TOOL_SPECS;
}
