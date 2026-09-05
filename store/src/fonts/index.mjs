/**
 * The four font packages.
 *
 * Two carry real font files: the italic companions to the two faces the OS
 * already ships upright, taken from the same open-licensed releases the OS
 * vendors and embedded here as data URLs. Their woff2 files and their licences
 * sit beside this module in `files/`, so the store directory can be lifted
 * somewhere else without losing them.
 *
 * The other two are drawn by this repository — a seven-segment face and a face
 * of Unicode block and box-drawing characters — because both are made of
 * rectangles and can therefore be written out honestly rather than guessed at.
 * Nothing in this catalogue contains invented font bytes.
 */

import { readFileSync } from 'node:fs';
import { BLOCKS, SEVEN_SEGMENT } from './glyphs.mjs';
import { buildFont } from './truetype.mjs';

function embedWoff2(fileName) {
  const bytes = readFileSync(new URL(`./files/${fileName}`, import.meta.url));
  return `data:font/woff2;base64,${bytes.toString('base64')}`;
}

function embedTrueType(font) {
  const bytes = Buffer.from(buildFont(font));
  return `data:font/ttf;base64,${bytes.toString('base64')}`;
}

export const PLEX_ITALIC = {
  id: 'com.lumen.font.plex-italic',
  kind: 'font',
  name: 'IBM Plex Sans Italic',
  tagline: 'The italic the interface face is missing.',
  version: '5.3.0',
  publisher: 'IBM, packaged by Lumen',
  category: 'fonts',
  price: 'free',
  keywords: ['font', 'italic', 'sans', 'plex', 'interface'],
  updated: '2026-07-30T09:00:00Z',
  description:
    'Lumen sets its interface in IBM Plex Sans and loads only the upright ' +
    'variable face, because an italic that is never used is a download nobody ' +
    'asked for. This package adds the italic.\n\n' +
    'It is the Latin subset of the variable italic from the same release the OS ' +
    'vendors, covering weights 100 to 700 on one axis, so emphasis in a document ' +
    'is drawn rather than sloped by the renderer. A synthesised oblique only ' +
    'slants the upright; a drawn italic changes the letterforms.\n\n' +
    'The file is embedded in the payload as a data URL, so installing it makes ' +
    'no second request. IBM Plex is licensed under the SIL Open Font License ' +
    '1.1; the licence travels with the package.',
  releaseNotes: 'Packaged from IBM Plex Sans 5.3.0, Latin subset.',
  requires: { os: '>=0.1.0' },
  capabilities: ['fonts'],
  screenshots: [{ shape: 'type', seed: 41, tone: 'neutral' }],
  payload: {
    family: 'IBM Plex Sans Variable',
    faces: [
      {
        weight: '100 700',
        style: 'italic',
        src: embedWoff2('ibm-plex-sans-latin-wght-italic.woff2'),
      },
    ],
  },
};

export const MONO_ITALIC = {
  id: 'com.lumen.font.mono-italic',
  kind: 'font',
  name: 'JetBrains Mono Italic',
  tagline: 'Sloped monospace for comments and captions.',
  version: '5.3.0',
  publisher: 'JetBrains, packaged by Lumen',
  category: 'fonts',
  price: 'free',
  keywords: ['font', 'italic', 'monospace', 'code', 'jetbrains'],
  updated: '2026-07-30T09:00:00Z',
  description:
    'The italic companion to the monospace face the OS sets values in. The ' +
    'upright is loaded at startup; the italic is not, so an editor asked to ' +
    'slope a comment gets a renderer-made oblique instead of the drawn letters.\n\n' +
    'This is the Latin subset of the variable italic, weights 100 to 800 on one ' +
    'axis, from the same release the OS vendors. It is worth having wherever ' +
    'monospace text distinguishes a comment, a caption or a placeholder from the ' +
    'code around it.\n\n' +
    'The file is embedded in the payload as a data URL. JetBrains Mono is ' +
    'licensed under the SIL Open Font License 1.1; the licence travels with the ' +
    'package.',
  releaseNotes: 'Packaged from JetBrains Mono 5.3.0, Latin subset.',
  requires: { os: '>=0.1.0' },
  capabilities: ['fonts'],
  screenshots: [{ shape: 'type', seed: 44, tone: 'accent' }],
  payload: {
    family: 'JetBrains Mono Variable',
    faces: [
      {
        weight: '100 800',
        style: 'italic',
        src: embedWoff2('jetbrains-mono-latin-wght-italic.woff2'),
      },
    ],
  },
};

export const SEVEN = {
  id: 'com.lumen.font.seven',
  kind: 'font',
  name: 'Lumen Seven',
  tagline: 'A seven-segment face for clocks and counters.',
  version: '1.0.0',
  publisher: 'Lumen',
  category: 'fonts',
  price: 'free',
  keywords: ['font', 'display', 'clock', 'digits', 'seven-segment'],
  updated: '2026-08-06T09:00:00Z',
  description:
    'The sixteen hexadecimal digits, a minus, a full stop and a colon, drawn as ' +
    'a seven-segment display: a 90 unit stroke on a 440 by 700 box with a six ' +
    'unit notch at every join, so the segments read as separate bars at any ' +
    'size. Every glyph has the same advance, so a counter does not shuffle as ' +
    'it counts.\n\n' +
    'It is a display face and nothing else. There are no letters beyond the six ' +
    'a hex digit needs — a to f render as the same segment shapes as A to F — ' +
    'and no punctuation beyond what a readout uses. Set it large, in a clock, a ' +
    'timer, a meter or a lap list.\n\n' +
    'The outlines are computed from the segment layout rather than taken from ' +
    'any existing typeface, and the file is built by this repository during the ' +
    'catalogue build, which is why it is a little over three kilobytes.',
  releaseNotes: 'First release.',
  requires: { os: '>=0.1.0' },
  capabilities: ['fonts'],
  screenshots: [{ shape: 'grid', seed: 47, tone: 'accent' }],
  payload: {
    family: 'Lumen Seven',
    faces: [{ weight: '400', style: 'normal', src: embedTrueType(SEVEN_SEGMENT) }],
  },
};

export const BLOCKS_FONT = {
  id: 'com.lumen.font.blocks',
  kind: 'font',
  name: 'Lumen Blocks',
  tagline: 'Block and box-drawing glyphs that meet exactly.',
  version: '1.0.0',
  publisher: 'Lumen',
  category: 'fonts',
  price: 'free',
  keywords: ['font', 'blocks', 'box-drawing', 'terminal', 'sparkline'],
  updated: '2026-08-06T09:00:00Z',
  description:
    'The eighth blocks, the half blocks, the three shades and eleven box-drawing ' +
    'characters, drawn on one 600 by 1000 cell so that adjacent cells join with ' +
    'no seam and no overlap. Terminal sparklines built from the lower eighth ' +
    'blocks line up along their tops; a box drawn from the corner and rule ' +
    'glyphs closes at every corner.\n\n' +
    'Most monospace faces draw these characters as an afterthought, a half unit ' +
    'out of alignment, which is why a box drawn in a terminal so often has gaps ' +
    'in it. Here the rule is 60 units centred on the cell, the same in every ' +
    'glyph, so the joins are exact by construction.\n\n' +
    'Use it as a fallback after your monospace face, so only these characters ' +
    'come from it. The outlines are rectangles computed from the Unicode ' +
    'descriptions and built during the catalogue build.',
  releaseNotes: 'First release.',
  requires: { os: '>=0.1.0' },
  capabilities: ['fonts'],
  screenshots: [
    { shape: 'grid', seed: 52, tone: 'neutral' },
    { shape: 'ramp', seed: 13, tone: 'accent' },
  ],
  payload: {
    family: 'Lumen Blocks',
    faces: [{ weight: '400', style: 'normal', src: embedTrueType(BLOCKS) }],
  },
};

export const FONTS = [PLEX_ITALIC, MONO_ITALIC, SEVEN, BLOCKS_FONT];
