/**
 * A minimal TrueType writer.
 *
 * Two of the font packages in this catalogue are drawn here rather than
 * licensed from somewhere: a seven-segment face and a face of block and
 * box-drawing characters. Both are made entirely of axis-aligned rectangles,
 * so the writer only has to emit straight, on-curve contours — no quadratic
 * control points, no hinting, no composite glyphs.
 *
 * Everything is deterministic: the same glyph tables produce the same bytes on
 * every run, which is what lets the build script hash a payload and get the
 * same digest tomorrow. The `created` and `modified` stamps are therefore
 * fixed rather than read from the clock.
 *
 * Outer contours are wound clockwise in the font's y-up space, which is the
 * TrueType convention for the filled side of a non-zero fill.
 */

/** 2020-01-01T00:00:00Z as seconds since the 1904 Mac epoch. */
const EPOCH_1904_TO_2020 = 3660595200;

class Writer {
  constructor() {
    this.bytes = [];
  }

  u8(value) {
    this.bytes.push(value & 0xff);
    return this;
  }

  u16(value) {
    return this.u8(value >> 8).u8(value);
  }

  i16(value) {
    return this.u16(value < 0 ? value + 0x10000 : value);
  }

  u32(value) {
    return this.u16(Math.floor(value / 0x10000)).u16(value & 0xffff);
  }

  i64(value) {
    return this.u32(Math.floor(value / 0x100000000)).u32(value >>> 0);
  }

  tag(text) {
    for (let i = 0; i < 4; i += 1) this.u8(text.charCodeAt(i));
    return this;
  }

  raw(list) {
    for (const byte of list) this.u8(byte);
    return this;
  }

  utf16(text) {
    for (let i = 0; i < text.length; i += 1) this.u16(text.charCodeAt(i));
    return this;
  }

  toBytes() {
    return Uint8Array.from(this.bytes);
  }
}

/** A rectangle wound clockwise, so it is the filled side of the outline. */
export function rect(x0, y0, x1, y1) {
  return [
    [x0, y0],
    [x0, y1],
    [x1, y1],
    [x1, y0],
  ];
}

function padTo4(bytes) {
  const short = bytes.length % 4;
  if (short === 0) return bytes;
  const padded = new Uint8Array(bytes.length + (4 - short));
  padded.set(bytes);
  return padded;
}

/** The sum of a table read as big-endian 32-bit words, as the spec defines it. */
function checksum(bytes) {
  let sum = 0;
  for (let i = 0; i < bytes.length; i += 4) {
    const word =
      ((bytes[i] ?? 0) << 24) |
      ((bytes[i + 1] ?? 0) << 16) |
      ((bytes[i + 2] ?? 0) << 8) |
      (bytes[i + 3] ?? 0);
    sum = (sum + (word >>> 0)) % 0x100000000;
  }
  return sum >>> 0;
}

function glyphBounds(glyph) {
  if (!glyph.contours.length) return { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
  let xMin = Infinity;
  let yMin = Infinity;
  let xMax = -Infinity;
  let yMax = -Infinity;
  for (const contour of glyph.contours) {
    for (const [x, y] of contour) {
      if (x < xMin) xMin = x;
      if (y < yMin) yMin = y;
      if (x > xMax) xMax = x;
      if (y > yMax) yMax = y;
    }
  }
  return { xMin, yMin, xMax, yMax };
}

function buildGlyf(glyph) {
  if (!glyph.contours.length) return new Uint8Array(0);
  const bounds = glyphBounds(glyph);
  const w = new Writer();
  w.i16(glyph.contours.length);
  w.i16(bounds.xMin).i16(bounds.yMin).i16(bounds.xMax).i16(bounds.yMax);
  let index = -1;
  for (const contour of glyph.contours) {
    index += contour.length;
    w.u16(index);
  }
  w.u16(0); // no instructions
  const points = glyph.contours.flat();
  for (let i = 0; i < points.length; i += 1) w.u8(0x01); // every point is on-curve
  let previous = 0;
  for (const [x] of points) {
    w.i16(Math.round(x) - previous);
    previous = Math.round(x);
  }
  previous = 0;
  for (const [, y] of points) {
    w.i16(Math.round(y) - previous);
    previous = Math.round(y);
  }
  return padTo4(w.toBytes());
}

/** Format 4: one segment per run of code points that map to consecutive glyphs. */
function buildCmap(codepoints) {
  const entries = [...codepoints.entries()].sort((a, b) => a[0] - b[0]);
  const segments = [];
  for (const [code, glyph] of entries) {
    const last = segments[segments.length - 1];
    if (last && code === last.end + 1 && glyph === last.startGlyph + (code - last.start)) {
      last.end = code;
    } else {
      segments.push({ start: code, end: code, startGlyph: glyph });
    }
  }
  segments.push({ start: 0xffff, end: 0xffff, startGlyph: 0xffff });

  const segCount = segments.length;
  const sub = new Writer();
  const length = 16 + segCount * 8;
  let searchRange = 2;
  let entrySelector = 0;
  while (searchRange * 2 <= segCount * 2) {
    searchRange *= 2;
    entrySelector += 1;
  }
  sub.u16(4).u16(length).u16(0);
  sub
    .u16(segCount * 2)
    .u16(searchRange)
    .u16(entrySelector)
    .u16(segCount * 2 - searchRange);
  for (const segment of segments) sub.u16(segment.end);
  sub.u16(0);
  for (const segment of segments) sub.u16(segment.start);
  for (const segment of segments) {
    sub.u16((segment.startGlyph - segment.start + 0x10000) & 0xffff);
  }
  for (let i = 0; i < segCount; i += 1) sub.u16(0);

  const subtable = sub.toBytes();
  const head = new Writer();
  head.u16(0).u16(2);
  head.u16(3).u16(1).u32(20); // Windows, BMP
  head.u16(0).u16(3).u32(20); // Unicode 2.0, BMP — same subtable
  const table = new Uint8Array(head.toBytes().length + subtable.length);
  table.set(head.toBytes());
  table.set(subtable, head.toBytes().length);
  return table;
}

function buildName(records) {
  const strings = [];
  const header = new Writer();
  header
    .u16(0)
    .u16(records.length)
    .u16(6 + records.length * 12);
  let offset = 0;
  for (const [id, text] of records) {
    const value = new Writer().utf16(text).toBytes();
    header.u16(3).u16(1).u16(0x0409).u16(id).u16(value.length).u16(offset);
    strings.push(value);
    offset += value.length;
  }
  const total = header.toBytes().length + offset;
  const table = new Uint8Array(total);
  table.set(header.toBytes());
  let at = header.toBytes().length;
  for (const value of strings) {
    table.set(value, at);
    at += value.length;
  }
  return table;
}

/**
 * Build a TrueType file.
 *
 * `glyphs[0]` is `.notdef` and is not reachable through the character map;
 * every other glyph carries the code points that select it.
 */
export function buildFont(font) {
  const glyphs = font.glyphs;
  const unitsPerEm = font.unitsPerEm;
  const codepoints = new Map();
  glyphs.forEach((glyph, index) => {
    for (const code of glyph.codepoints ?? []) codepoints.set(code, index);
  });

  const glyfParts = glyphs.map(buildGlyf);
  const offsets = [0];
  for (const part of glyfParts) offsets.push(offsets[offsets.length - 1] + part.length);
  const glyfLength = offsets[offsets.length - 1];
  const glyf = new Uint8Array(glyfLength);
  let at = 0;
  for (const part of glyfParts) {
    glyf.set(part, at);
    at += part.length;
  }

  const locaWriter = new Writer();
  for (const offset of offsets) locaWriter.u32(offset);
  const loca = locaWriter.toBytes();

  const bounds = glyphs.map(glyphBounds);
  const drawn = glyphs.map((g, i) => (g.contours.length ? bounds[i] : null)).filter(Boolean);
  const xMin = drawn.length ? Math.min(...drawn.map((b) => b.xMin)) : 0;
  const yMin = drawn.length ? Math.min(...drawn.map((b) => b.yMin)) : 0;
  const xMax = drawn.length ? Math.max(...drawn.map((b) => b.xMax)) : 0;
  const yMax = drawn.length ? Math.max(...drawn.map((b) => b.yMax)) : 0;
  const advanceMax = Math.max(...glyphs.map((g) => g.advance));

  const head = new Writer();
  head.u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5);
  head.u16(0x0003).u16(unitsPerEm);
  head.i64(EPOCH_1904_TO_2020).i64(EPOCH_1904_TO_2020);
  head.i16(xMin).i16(yMin).i16(xMax).i16(yMax);
  head.u16(0).u16(8).i16(2).i16(1).i16(0);

  const hhea = new Writer();
  hhea.u32(0x00010000);
  hhea.i16(font.ascender).i16(font.descender).i16(font.lineGap);
  hhea.u16(advanceMax).i16(xMin).i16(0).i16(xMax);
  hhea.i16(1).i16(0).i16(0);
  hhea.i16(0).i16(0).i16(0).i16(0);
  hhea.i16(0).u16(glyphs.length);

  const maxPoints = Math.max(...glyphs.map((g) => g.contours.flat().length));
  const maxContours = Math.max(...glyphs.map((g) => g.contours.length));
  const maxp = new Writer();
  maxp.u32(0x00010000).u16(glyphs.length).u16(maxPoints).u16(maxContours);
  maxp.u16(0).u16(0).u16(2).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0).u16(0);

  const hmtx = new Writer();
  for (let i = 0; i < glyphs.length; i += 1) {
    hmtx.u16(glyphs[i].advance).i16(bounds[i].xMin);
  }

  const cmap = buildCmap(codepoints);
  const codes = [...codepoints.keys()];
  const os2 = new Writer();
  os2.u16(4);
  os2.i16(Math.round(advanceMax * 0.6));
  os2.u16(400).u16(5).u16(0);
  os2.i16(650).i16(650).i16(0).i16(75);
  os2.i16(650).i16(650).i16(0).i16(350);
  os2.i16(50).i16(Math.round(unitsPerEm * 0.26));
  os2.i16(0);
  os2.raw(font.panose);
  os2.u32(0).u32(0).u32(0).u32(0);
  os2.tag('LMNS');
  os2.u16(0x0040);
  os2.u16(Math.min(...codes)).u16(Math.max(...codes));
  os2.i16(font.ascender).i16(font.descender).i16(font.lineGap);
  os2.u16(font.ascender).u16(Math.abs(font.descender));
  os2.u32(1).u32(0);
  os2.i16(font.xHeight).i16(font.capHeight);
  os2.u16(0x0020).u16(0x0020).u16(1);

  const post = new Writer();
  post.u32(0x00030000).u32(0);
  post.i16(Math.round(-unitsPerEm * 0.1)).i16(Math.round(unitsPerEm * 0.05));
  post.u32(font.fixedPitch ? 1 : 0);
  post.u32(0).u32(0).u32(0).u32(0);

  const name = buildName([
    [0, font.copyright],
    [1, font.family],
    [2, 'Regular'],
    [3, `${font.family} Regular 1.000`],
    [4, `${font.family} Regular`],
    [5, 'Version 1.000'],
    [6, font.postScriptName],
    [13, font.licence],
  ]);

  // A directory entry records the table's real length; the bytes that follow
  // are padded to a four byte boundary and the checksum covers the padding.
  const entry = (tag, bytes) => [tag, bytes.length, padTo4(bytes)];
  const tables = [
    entry('OS/2', os2.toBytes()),
    entry('cmap', cmap),
    entry('glyf', glyf),
    entry('head', head.toBytes()),
    entry('hhea', hhea.toBytes()),
    entry('hmtx', hmtx.toBytes()),
    entry('loca', loca),
    entry('maxp', maxp.toBytes()),
    entry('name', name),
    entry('post', post.toBytes()),
  ].sort((a, b) => (a[0] < b[0] ? -1 : 1));

  const numTables = tables.length;
  let searchRange = 16;
  let entrySelector = 0;
  while (searchRange * 2 <= numTables * 16) {
    searchRange *= 2;
    entrySelector += 1;
  }

  const directoryLength = 12 + numTables * 16;
  const file = new Writer();
  file.u32(0x00010000).u16(numTables).u16(searchRange).u16(entrySelector);
  file.u16(numTables * 16 - searchRange);
  let cursor = directoryLength;
  for (const [tag, length, bytes] of tables) {
    file.tag(tag).u32(checksum(bytes)).u32(cursor).u32(length);
    cursor += bytes.length;
  }
  for (const [, , bytes] of tables) file.raw(bytes);

  const out = file.toBytes();
  // checkSumAdjustment is the one field that depends on the finished file.
  const headEntry = tables.findIndex(([tag]) => tag === 'head');
  let headOffset = directoryLength;
  for (let i = 0; i < headEntry; i += 1) headOffset += tables[i][2].length;
  const adjustment = (0xb1b0afba - checksum(out)) >>> 0;
  out[headOffset + 8] = (adjustment >>> 24) & 0xff;
  out[headOffset + 9] = (adjustment >>> 16) & 0xff;
  out[headOffset + 10] = (adjustment >>> 8) & 0xff;
  out[headOffset + 11] = adjustment & 0xff;
  return out;
}
