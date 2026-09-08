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

/**
 * Elements a click acts on. The same list the base stylesheet gives
 * `cursor: pointer`, kept here as well because the stylesheet cannot be asked:
 * while this layer is drawing, `[data-lumen-cursor="custom"] *` sets
 * `cursor: none !important` on everything, so the computed value of every
 * element in the OS is `none` and says nothing about what the element is.
 */
const POINTER = [
  'button',
  'summary',
  'select',
  'a[href]',
  '[role="button"]',
  '[role="tab"]',
  '[role="link"]',
  '[role="option"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  'input[type="range"]',
  'input[type="color"]',
  'input[type="file"]',
].join(',');

/** Controls that will not act on a click. */
const NOT_ALLOWED = ':disabled,[aria-disabled="true"]';

/** Somewhere a caret goes. */
const TEXT = [
  'input:not([type])',
  'input[type="text"]',
  'input[type="search"]',
  'input[type="email"]',
  'input[type="url"]',
  'input[type="tel"]',
  'input[type="password"]',
  'input[type="number"]',
  'textarea',
  '[contenteditable="true"]',
].join(',');

/**
 * The shape the pointer should take over an element, read from the element
 * itself rather than from the stylesheet.
 *
 * It walks up from what the pointer is actually over — a click usually lands
 * on the glyph inside a button, not on the button — and the first node that
 * says anything wins, so the nearest answer is the one used: a disabled
 * button inside a clickable row is not-allowed, and a button inside a pane
 * that asked for a resize cursor is still a button.
 *
 * `data-cursor` comes first at every level, because it is the one an element
 * states outright; everything below it is inference from what the element is.
 * Null means nothing along the way had an opinion.
 */
export function shapeForElement(from: Element | null, stop?: Element | null): Shape | null {
  let node = from;
  while (node && node !== stop) {
    const hinted = (node as HTMLElement).dataset?.cursor;
    if (hinted) return shapeForCursor(hinted);
    if (node.matches(NOT_ALLOWED)) return 'not-allowed';
    if (node.matches(TEXT)) return 'text';
    if (node.matches(POINTER)) return 'pointer';
    node = node.parentElement;
  }
  return null;
}
