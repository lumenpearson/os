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
  | 'text-vertical'
  | 'grab'
  | 'grabbing'
  | 'ew'
  | 'ns'
  | 'col'
  | 'row'
  | 'nesw'
  | 'nwse'
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'ne'
  | 'nw'
  | 'se'
  | 'sw'
  | 'move'
  | 'not-allowed'
  | 'no-drop'
  | 'copy'
  | 'alias'
  | 'context-menu'
  | 'cell'
  | 'help'
  | 'zoom-in'
  | 'zoom-out'
  | 'progress'
  | 'wait'
  | 'crosshair'
  | 'none';

export const CURSOR_TO_SHAPE: Record<string, Shape> = {
  auto: 'arrow',
  default: 'arrow',
  pointer: 'pointer',
  text: 'text',
  'vertical-text': 'text-vertical',
  grab: 'grab',
  grabbing: 'grabbing',
  'col-resize': 'col',
  'row-resize': 'row',
  'ew-resize': 'ew',
  'ns-resize': 'ns',
  'nesw-resize': 'nesw',
  'nwse-resize': 'nwse',
  // A single direction gets a single arrow. The web habit of drawing the
  // two-headed one for `e-resize` is a shrug where the drawing knows the
  // answer: the edge under the pointer moves, and only that edge.
  'n-resize': 'n',
  's-resize': 's',
  'e-resize': 'e',
  'w-resize': 'w',
  'ne-resize': 'ne',
  'nw-resize': 'nw',
  'se-resize': 'se',
  'sw-resize': 'sw',
  move: 'move',
  'all-scroll': 'move',
  'not-allowed': 'not-allowed',
  'no-drop': 'no-drop',
  copy: 'copy',
  alias: 'alias',
  'context-menu': 'context-menu',
  cell: 'cell',
  help: 'help',
  'zoom-in': 'zoom-in',
  'zoom-out': 'zoom-out',
  // `wait` has stopped answering; `progress` is still working and still
  // takes a click. Drawing one for the other tells the person the wrong
  // thing about whether the OS is listening.
  wait: 'wait',
  progress: 'progress',
  crosshair: 'crosshair',
  none: 'none',
};

/** The shape a CSS `cursor` value asks for; the arrow when it names none we draw. */
export function shapeForCursor(value: string | undefined): Shape {
  if (value === undefined) return 'arrow';
  return CURSOR_TO_SHAPE[value.trim()] ?? 'arrow';
}
