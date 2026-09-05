/**
 * The outlines for the two faces this catalogue draws itself.
 *
 * Both are rectangle-only, which is the whole reason they can be synthesised
 * honestly: a seven-segment display and the Unicode block and box-drawing
 * characters are defined by rectangles, so nothing here is an approximation of
 * a real typeface. Coordinates are in a 1000 unit em with y pointing up.
 */

import { rect } from './truetype.mjs';

const EM = 1000;

/* Seven-segment geometry. The digit box is 440 wide by 700 tall, sitting on
   the baseline, with a 90 unit stroke and a 6 unit notch at every join. */
const W = 440;
const H = 700;
const T = 90;
const MID = 350;
const NOTCH = 6;

const SEGMENTS = {
  a: rect(T + NOTCH, H - T, W - T - NOTCH, H),
  b: rect(W - T, MID + T / 2 + NOTCH, W, H - T - NOTCH),
  c: rect(W - T, T + NOTCH, W, MID - T / 2 - NOTCH),
  d: rect(T + NOTCH, 0, W - T - NOTCH, T),
  e: rect(0, T + NOTCH, T, MID - T / 2 - NOTCH),
  f: rect(0, MID + T / 2 + NOTCH, T, H - T - NOTCH),
  g: rect(T + NOTCH, MID - T / 2, W - T - NOTCH, MID + T / 2),
};

/** Which segments are lit, in the shapes a hex display uses. */
const DIGITS = {
  0: 'abcdef',
  1: 'bc',
  2: 'abdeg',
  3: 'abcdg',
  4: 'bcfg',
  5: 'acdfg',
  6: 'acdefg',
  7: 'abc',
  8: 'abcdefg',
  9: 'abcdfg',
  A: 'abcefg',
  B: 'cdefg',
  C: 'adef',
  D: 'bcdeg',
  E: 'adefg',
  F: 'aefg',
};

const SEVEN_ADVANCE = 600;
const SIDE = (SEVEN_ADVANCE - W) / 2;

function shift(contours, dx) {
  return contours.map((contour) => contour.map(([x, y]) => [x + dx, y]));
}

function segmentGlyph(lit, codepoints) {
  const contours = lit.split('').map((key) => SEGMENTS[key]);
  return { advance: SEVEN_ADVANCE, contours: shift(contours, SIDE), codepoints };
}

/** A hollow box, the conventional drawing for a character the font lacks. */
function notdef(advance, thickness, top, bottom) {
  const outer = rect(thickness, bottom, advance - thickness, top);
  const inner = rect(thickness * 2, bottom + thickness, advance - thickness * 2, top - thickness)
    .slice()
    .reverse();
  return { advance, contours: [outer, inner], codepoints: [] };
}

export const SEVEN_SEGMENT = {
  family: 'Lumen Seven',
  postScriptName: 'LumenSeven-Regular',
  copyright: 'Lumen, 2026. Drawn from segment geometry, not from a licensed typeface.',
  licence: 'MIT. The outlines are rectangles computed from the seven-segment layout.',
  unitsPerEm: EM,
  ascender: 750,
  descender: -200,
  lineGap: 0,
  capHeight: H,
  xHeight: H,
  fixedPitch: true,
  panose: [2, 0, 5, 9, 0, 0, 0, 0, 0, 0],
  glyphs: [
    notdef(SEVEN_ADVANCE, 40, H, 0),
    { advance: SEVEN_ADVANCE, contours: [], codepoints: [0x20] },
    ...['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) =>
      segmentGlyph(DIGITS[d], [d.charCodeAt(0)]),
    ),
    ...['A', 'B', 'C', 'D', 'E', 'F'].map((d) =>
      segmentGlyph(DIGITS[d], [d.charCodeAt(0), d.toLowerCase().charCodeAt(0)]),
    ),
    { advance: SEVEN_ADVANCE, contours: [shift([SEGMENTS.g], SIDE)[0]], codepoints: [0x2d] },
    { advance: 260, contours: [rect(85, 0, 175, T)], codepoints: [0x2e] },
    {
      advance: 260,
      contours: [rect(85, 190, 175, 280), rect(85, 420, 175, 510)],
      codepoints: [0x3a],
    },
  ],
};

/* Block geometry. The cell is 600 wide and runs from -200 to 800, so a full
   block covers the line box exactly and eighths divide without a remainder. */
const CELL_W = 600;
const CELL_TOP = 800;
const CELL_BOTTOM = -200;
const CELL_H = CELL_TOP - CELL_BOTTOM;
const RULE = 60;
const RULE_X0 = (CELL_W - RULE) / 2;
const RULE_X1 = (CELL_W + RULE) / 2;
const RULE_Y0 = (CELL_TOP + CELL_BOTTOM - RULE) / 2;
const RULE_Y1 = (CELL_TOP + CELL_BOTTOM + RULE) / 2;

function block(contours, codepoints) {
  return { advance: CELL_W, contours, codepoints };
}

function lowerBlock(eighths, codepoints) {
  return block([rect(0, CELL_BOTTOM, CELL_W, CELL_BOTTOM + (CELL_H * eighths) / 8)], codepoints);
}

function leftBlock(eighths, codepoints) {
  return block([rect(0, CELL_BOTTOM, (CELL_W * eighths) / 8, CELL_TOP)], codepoints);
}

/** A shade is a grid of squares; the predicate says which cells are filled. */
function shade(fills, codepoints) {
  const contours = [];
  const stepX = CELL_W / 6;
  const stepY = CELL_H / 10;
  for (let column = 0; column < 6; column += 1) {
    for (let row = 0; row < 10; row += 1) {
      if (!fills(column, row)) continue;
      const x = column * stepX;
      const y = CELL_BOTTOM + row * stepY;
      contours.push(rect(x, y, x + stepX, y + stepY));
    }
  }
  return block(contours, codepoints);
}

const H_LEFT = rect(0, RULE_Y0, RULE_X1, RULE_Y1);
const H_RIGHT = rect(RULE_X0, RULE_Y0, CELL_W, RULE_Y1);
const H_FULL = rect(0, RULE_Y0, CELL_W, RULE_Y1);
const V_DOWN = rect(RULE_X0, CELL_BOTTOM, RULE_X1, RULE_Y1);
const V_UP = rect(RULE_X0, RULE_Y0, RULE_X1, CELL_TOP);
const V_FULL = rect(RULE_X0, CELL_BOTTOM, RULE_X1, CELL_TOP);

export const BLOCKS = {
  family: 'Lumen Blocks',
  postScriptName: 'LumenBlocks-Regular',
  copyright: 'Lumen, 2026. Rectangles computed from the Unicode block descriptions.',
  licence: 'MIT. Every glyph is an axis-aligned rectangle or a grid of them.',
  unitsPerEm: EM,
  ascender: CELL_TOP,
  descender: CELL_BOTTOM,
  lineGap: 0,
  capHeight: 700,
  xHeight: 500,
  fixedPitch: true,
  panose: [2, 0, 5, 9, 0, 0, 0, 0, 0, 0],
  glyphs: [
    notdef(CELL_W, 50, CELL_TOP, CELL_BOTTOM),
    block([], [0x20]),
    block([rect(0, (CELL_TOP + CELL_BOTTOM) / 2, CELL_W, CELL_TOP)], [0x2580]),
    ...[1, 2, 3, 4, 5, 6, 7].map((n) => lowerBlock(n, [0x2580 + n])),
    block([rect(0, CELL_BOTTOM, CELL_W, CELL_TOP)], [0x2588]),
    ...[7, 6, 5, 4, 3, 2, 1].map((n, i) => leftBlock(n, [0x2589 + i])),
    block([rect(CELL_W / 2, CELL_BOTTOM, CELL_W, CELL_TOP)], [0x2590]),
    shade((c, r) => c % 2 === 0 && r % 2 === 0, [0x2591]),
    shade((c, r) => (c + r) % 2 === 0, [0x2592]),
    shade((c, r) => !(c % 2 === 1 && r % 2 === 1), [0x2593]),
    block([H_FULL], [0x2500]),
    block([V_FULL], [0x2502]),
    block([H_RIGHT, V_DOWN], [0x250c]),
    block([H_LEFT, V_DOWN], [0x2510]),
    block([H_RIGHT, V_UP], [0x2514]),
    block([H_LEFT, V_UP], [0x2518]),
    block([V_FULL, H_RIGHT], [0x251c]),
    block([V_FULL, H_LEFT], [0x2524]),
    block([H_FULL, V_DOWN], [0x252c]),
    block([H_FULL, V_UP], [0x2534]),
    block([H_FULL, V_FULL], [0x253c]),
  ],
};
