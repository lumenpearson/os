/**
 * The shape the cursor takes, and which CSS `cursor` value asks for it.
 *
 * The layer draws every shape once and shows the one the pointer's target
 * calls for, so this table is the whole of the decision. It lives apart from
 * the drawing because it is the part with an answer that can be wrong: a
 * value nobody mapped silently becomes an arrow, which is a cursor saying the
 * wrong thing rather than a cursor missing.
 */
export type Shape =
  | 'arrow'
  | 'pointer'
  | 'text'
  | 'grab'
  | 'grabbing'
  | 'ew'
  | 'ns'
  | 'col'
  | 'row'
  | 'nesw'
  | 'nwse'
  | 'move'
  | 'not-allowed'
  | 'wait'
  | 'crosshair'
  | 'none';

export const CURSOR_TO_SHAPE: Record<string, Shape> = {
  auto: 'arrow',
  default: 'arrow',
  pointer: 'pointer',
  text: 'text',
  'vertical-text': 'text',
  grab: 'grab',
  grabbing: 'grabbing',
  'col-resize': 'col',
  'e-resize': 'ew',
  'w-resize': 'ew',
  'ew-resize': 'ew',
  'row-resize': 'row',
  'n-resize': 'ns',
  's-resize': 'ns',
  'ns-resize': 'ns',
  'ne-resize': 'nesw',
  'sw-resize': 'nesw',
  'nesw-resize': 'nesw',
  'nw-resize': 'nwse',
  'se-resize': 'nwse',
  'nwse-resize': 'nwse',
  move: 'move',
  'all-scroll': 'move',
  'not-allowed': 'not-allowed',
  wait: 'wait',
  progress: 'wait',
  crosshair: 'crosshair',
  none: 'none',
};

/** The shape a CSS `cursor` value asks for; the arrow when it names none we draw. */
export function shapeForCursor(value: string | undefined): Shape {
  if (value === undefined) return 'arrow';
  return CURSOR_TO_SHAPE[value.trim()] ?? 'arrow';
}
