/**
 * Which drawing each shape takes.
 *
 * The drawings themselves live in `@lumen/ui` because Settings draws them too;
 * this is the half that only the shell needs — the map from the shape the
 * pointer is asking for to the picture that says it.
 */

import { CURSOR_DRAWINGS, type CursorDrawing } from '@lumen/ui';
import type { Shape } from '../shapes';

export { CURSOR_ART_BOX as ART_BOX } from '@lumen/ui';

export const CURSOR_ART: Record<Exclude<Shape, 'none'>, CursorDrawing> = {
  arrow: CURSOR_DRAWINGS.default,
  pointer: CURSOR_DRAWINGS.handpointing,
  text: CURSOR_DRAWINGS.textcursor,
  'text-vertical': CURSOR_DRAWINGS.textcursorvertical,
  grab: CURSOR_DRAWINGS.handopen,
  grabbing: CURSOR_DRAWINGS.handgrabbing,
  ew: CURSOR_DRAWINGS.resizewesteast,
  ns: CURSOR_DRAWINGS.resizenorthsouth,
  col: CURSOR_DRAWINGS.resizeleftright,
  row: CURSOR_DRAWINGS.resizeupdown,
  nesw: CURSOR_DRAWINGS.resizenortheastsouthwest,
  nwse: CURSOR_DRAWINGS.resizenorthwestsoutheast,
  n: CURSOR_DRAWINGS.resizenorth,
  s: CURSOR_DRAWINGS.resizesouth,
  e: CURSOR_DRAWINGS.resizeeast,
  w: CURSOR_DRAWINGS.resizewest,
  ne: CURSOR_DRAWINGS.resizenortheast,
  nw: CURSOR_DRAWINGS.resizenorthwest,
  se: CURSOR_DRAWINGS.resizesoutheast,
  sw: CURSOR_DRAWINGS.resizesouthwest,
  move: CURSOR_DRAWINGS.move,
  crosshair: CURSOR_DRAWINGS.cross,
  cell: CURSOR_DRAWINGS.cell,
  help: CURSOR_DRAWINGS.help,
  'zoom-in': CURSOR_DRAWINGS.zoomin,
  'zoom-out': CURSOR_DRAWINGS.zoomout,
  'not-allowed': CURSOR_DRAWINGS.notallowed,
  // The puff of smoke: what is being dragged will be let go of and lost.
  'no-drop': CURSOR_DRAWINGS.poof,
  copy: CURSOR_DRAWINGS.copy,
  alias: CURSOR_DRAWINGS.makealias,
  'context-menu': CURSOR_DRAWINGS.contextualmenu,
  // `progress` is the arrow with a spinner beside it — still listening.
  progress: CURSOR_DRAWINGS.busy,
  // The beachball is the whole cursor rather than a badge on an arrow: the
  // system is not taking a moment, it has stopped answering.
  wait: CURSOR_DRAWINGS.beachball,
};
