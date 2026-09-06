/**
 * The cursor drawings, and where each one's point is.
 *
 * Thirty-nine SVGs at 32×32, one per state, kept here rather than in the
 * shell because Settings draws them too — the style picker shows the arrow
 * the OS will actually use, and `packages/apps` cannot reach into the shell.
 *
 * They arrived without a `viewBox`, which meant nothing scaled them: at any
 * size but 32 px the browser left the drawing in the corner of a larger box.
 * Each file carries one now. Their gradients and `<use>` targets arrived on
 * single-letter ids as well, and drawings that may share a document cannot
 * share `id="A"`, so every id is prefixed with the name of its file.
 *
 * The hotspots were measured rather than guessed: each drawing was rasterised
 * and its ink read back, so the arrow's point is the topmost-leftmost pixel at
 * (10, 7.5) — which agrees with the first coordinate of the path that draws
 * it. Anything symmetrical takes the middle of the box; a hand takes the
 * middle of its own ink, which is not the middle of the box.
 */

import beachball from './beachball.svg?raw';
import busy from './busy.svg?raw';
import cell from './cell.svg?raw';
import contextualmenu from './contextualmenu.svg?raw';
import copy from './copy.svg?raw';
import cross from './cross.svg?raw';
import defaultArrow from './default.svg?raw';
import handgrabbing from './handgrabbing.svg?raw';
import handopen from './handopen.svg?raw';
import handpointing from './handpointing.svg?raw';
import help from './help.svg?raw';
import makealias from './makealias.svg?raw';
import move from './move.svg?raw';
import notallowed from './notallowed.svg?raw';
import poof from './poof.svg?raw';
import resizeeast from './resizeeast.svg?raw';
import resizeleftright from './resizeleftright.svg?raw';
import resizenorth from './resizenorth.svg?raw';
import resizenortheast from './resizenortheast.svg?raw';
import resizenortheastsouthwest from './resizenortheastsouthwest.svg?raw';
import resizenorthsouth from './resizenorthsouth.svg?raw';
import resizenorthwest from './resizenorthwest.svg?raw';
import resizenorthwestsoutheast from './resizenorthwestsoutheast.svg?raw';
import resizesouth from './resizesouth.svg?raw';
import resizesoutheast from './resizesoutheast.svg?raw';
import resizesouthwest from './resizesouthwest.svg?raw';
import resizeupdown from './resizeupdown.svg?raw';
import resizewest from './resizewest.svg?raw';
import resizewesteast from './resizewesteast.svg?raw';
import textcursor from './textcursor.svg?raw';
import textcursorvertical from './textcursorvertical.svg?raw';
import zoomin from './zoomin.svg?raw';
import zoomout from './zoomout.svg?raw';

/** Every drawing in the set is 32 units across. */
export const CURSOR_ART_BOX = 32;

export interface CursorHotspot {
  x: number;
  y: number;
}

/** The middle of the box, which is the point of anything symmetrical. */
const MIDDLE: CursorHotspot = { x: 16, y: 16 };

export interface CursorDrawing {
  /** The drawing, as markup. */
  svg: string;
  /** Where the point is, in the 32-unit box. */
  hotspot: CursorHotspot;
}

/** Every drawing the set ships, by the name of the file it came from. */
export const CURSOR_DRAWINGS = {
  beachball: { svg: beachball, hotspot: MIDDLE },
  busy: { svg: busy, hotspot: { x: 7, y: 0.5 } },
  cell: { svg: cell, hotspot: MIDDLE },
  contextualmenu: { svg: contextualmenu, hotspot: { x: 8, y: 7.5 } },
  copy: { svg: copy, hotspot: { x: 7, y: 0.5 } },
  cross: { svg: cross, hotspot: MIDDLE },
  default: { svg: defaultArrow, hotspot: { x: 10, y: 7.5 } },
  handgrabbing: { svg: handgrabbing, hotspot: { x: 15.3, y: 15.9 } },
  // A hand is not drawn in the middle of its box, and the palm is the point.
  handopen: { svg: handopen, hotspot: { x: 14.9, y: 14.1 } },
  handpointing: { svg: handpointing, hotspot: { x: 13.2, y: 8 } },
  help: { svg: help, hotspot: MIDDLE },
  makealias: { svg: makealias, hotspot: { x: 10.8, y: 9 } },
  move: { svg: move, hotspot: MIDDLE },
  // The badge cursors are one arrow with something added, and that arrow sits
  // at the very top of its box rather than where `default` puts it.
  notallowed: { svg: notallowed, hotspot: { x: 7, y: 0.5 } },
  poof: { svg: poof, hotspot: { x: 7, y: 0.5 } },
  resizeeast: { svg: resizeeast, hotspot: MIDDLE },
  resizeleftright: { svg: resizeleftright, hotspot: MIDDLE },
  resizenorth: { svg: resizenorth, hotspot: MIDDLE },
  resizenortheast: { svg: resizenortheast, hotspot: MIDDLE },
  resizenortheastsouthwest: { svg: resizenortheastsouthwest, hotspot: MIDDLE },
  resizenorthsouth: { svg: resizenorthsouth, hotspot: MIDDLE },
  resizenorthwest: { svg: resizenorthwest, hotspot: MIDDLE },
  resizenorthwestsoutheast: { svg: resizenorthwestsoutheast, hotspot: MIDDLE },
  resizesouth: { svg: resizesouth, hotspot: MIDDLE },
  resizesoutheast: { svg: resizesoutheast, hotspot: MIDDLE },
  resizesouthwest: { svg: resizesouthwest, hotspot: MIDDLE },
  resizeupdown: { svg: resizeupdown, hotspot: MIDDLE },
  resizewest: { svg: resizewest, hotspot: MIDDLE },
  resizewesteast: { svg: resizewesteast, hotspot: MIDDLE },
  textcursor: { svg: textcursor, hotspot: MIDDLE },
  textcursorvertical: { svg: textcursorvertical, hotspot: MIDDLE },
  zoomin: { svg: zoomin, hotspot: MIDDLE },
  zoomout: { svg: zoomout, hotspot: MIDDLE },
} as const satisfies Record<string, CursorDrawing>;

/** The name of every drawing in the set. */
export type CursorDrawingName = keyof typeof CURSOR_DRAWINGS;
