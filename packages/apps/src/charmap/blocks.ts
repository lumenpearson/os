/**
 * The Unicode blocks this map offers, with their real ranges.
 *
 * There is no Unicode character database in this system, so the only facts
 * here are the ones that can be stated exactly: a block's published name and
 * its first and last code point. A block whose range could not be stated with
 * certainty was left out rather than guessed — the list is deliberately a
 * curated selection, not a claim to be complete, and the app says so.
 *
 * Every Unicode block starts at a multiple of 16 and ends one short of the
 * next multiple of 16. `blocks.test.ts` holds that invariant, along with
 * ordering and non-overlap, because a mistyped digit in this table would
 * otherwise show up as a silently wrong grid.
 */

import { formatCodePoint } from './chars';

export interface UnicodeBlock {
  /** Stable id: used in the sidebar, the menus and the settings file. */
  id: string;
  /** The block name as Unicode publishes it. */
  name: string;
  /** First code point in the block. */
  start: number;
  /** Last code point in the block, inclusive. */
  end: number;
}

export const BLOCKS: readonly UnicodeBlock[] = [
  { id: 'basic-latin', name: 'Basic Latin', start: 0x0000, end: 0x007f },
  { id: 'latin-1-supplement', name: 'Latin-1 Supplement', start: 0x0080, end: 0x00ff },
  { id: 'latin-extended-a', name: 'Latin Extended-A', start: 0x0100, end: 0x017f },
  { id: 'latin-extended-b', name: 'Latin Extended-B', start: 0x0180, end: 0x024f },
  { id: 'ipa-extensions', name: 'IPA Extensions', start: 0x0250, end: 0x02af },
  { id: 'spacing-modifier-letters', name: 'Spacing Modifier Letters', start: 0x02b0, end: 0x02ff },
  {
    id: 'combining-diacritical-marks',
    name: 'Combining Diacritical Marks',
    start: 0x0300,
    end: 0x036f,
  },
  { id: 'greek-and-coptic', name: 'Greek and Coptic', start: 0x0370, end: 0x03ff },
  { id: 'cyrillic', name: 'Cyrillic', start: 0x0400, end: 0x04ff },
  { id: 'cyrillic-supplement', name: 'Cyrillic Supplement', start: 0x0500, end: 0x052f },
  { id: 'armenian', name: 'Armenian', start: 0x0530, end: 0x058f },
  { id: 'hebrew', name: 'Hebrew', start: 0x0590, end: 0x05ff },
  { id: 'arabic', name: 'Arabic', start: 0x0600, end: 0x06ff },
  { id: 'devanagari', name: 'Devanagari', start: 0x0900, end: 0x097f },
  { id: 'thai', name: 'Thai', start: 0x0e00, end: 0x0e7f },
  { id: 'georgian', name: 'Georgian', start: 0x10a0, end: 0x10ff },
  { id: 'ogham', name: 'Ogham', start: 0x1680, end: 0x169f },
  { id: 'runic', name: 'Runic', start: 0x16a0, end: 0x16ff },
  {
    id: 'latin-extended-additional',
    name: 'Latin Extended Additional',
    start: 0x1e00,
    end: 0x1eff,
  },
  { id: 'greek-extended', name: 'Greek Extended', start: 0x1f00, end: 0x1fff },
  { id: 'general-punctuation', name: 'General Punctuation', start: 0x2000, end: 0x206f },
  {
    id: 'superscripts-and-subscripts',
    name: 'Superscripts and Subscripts',
    start: 0x2070,
    end: 0x209f,
  },
  { id: 'currency-symbols', name: 'Currency Symbols', start: 0x20a0, end: 0x20cf },
  {
    id: 'combining-marks-for-symbols',
    name: 'Combining Diacritical Marks for Symbols',
    start: 0x20d0,
    end: 0x20ff,
  },
  { id: 'letterlike-symbols', name: 'Letterlike Symbols', start: 0x2100, end: 0x214f },
  { id: 'number-forms', name: 'Number Forms', start: 0x2150, end: 0x218f },
  { id: 'arrows', name: 'Arrows', start: 0x2190, end: 0x21ff },
  { id: 'mathematical-operators', name: 'Mathematical Operators', start: 0x2200, end: 0x22ff },
  { id: 'miscellaneous-technical', name: 'Miscellaneous Technical', start: 0x2300, end: 0x23ff },
  { id: 'control-pictures', name: 'Control Pictures', start: 0x2400, end: 0x243f },
  {
    id: 'optical-character-recognition',
    name: 'Optical Character Recognition',
    start: 0x2440,
    end: 0x245f,
  },
  { id: 'enclosed-alphanumerics', name: 'Enclosed Alphanumerics', start: 0x2460, end: 0x24ff },
  { id: 'box-drawing', name: 'Box Drawing', start: 0x2500, end: 0x257f },
  { id: 'block-elements', name: 'Block Elements', start: 0x2580, end: 0x259f },
  { id: 'geometric-shapes', name: 'Geometric Shapes', start: 0x25a0, end: 0x25ff },
  { id: 'miscellaneous-symbols', name: 'Miscellaneous Symbols', start: 0x2600, end: 0x26ff },
  { id: 'dingbats', name: 'Dingbats', start: 0x2700, end: 0x27bf },
  {
    id: 'miscellaneous-mathematical-symbols-a',
    name: 'Miscellaneous Mathematical Symbols-A',
    start: 0x27c0,
    end: 0x27ef,
  },
  { id: 'supplemental-arrows-a', name: 'Supplemental Arrows-A', start: 0x27f0, end: 0x27ff },
  { id: 'braille-patterns', name: 'Braille Patterns', start: 0x2800, end: 0x28ff },
  { id: 'supplemental-arrows-b', name: 'Supplemental Arrows-B', start: 0x2900, end: 0x297f },
  {
    id: 'miscellaneous-mathematical-symbols-b',
    name: 'Miscellaneous Mathematical Symbols-B',
    start: 0x2980,
    end: 0x29ff,
  },
  {
    id: 'supplemental-mathematical-operators',
    name: 'Supplemental Mathematical Operators',
    start: 0x2a00,
    end: 0x2aff,
  },
  {
    id: 'miscellaneous-symbols-and-arrows',
    name: 'Miscellaneous Symbols and Arrows',
    start: 0x2b00,
    end: 0x2bff,
  },
  { id: 'supplemental-punctuation', name: 'Supplemental Punctuation', start: 0x2e00, end: 0x2e7f },
  {
    id: 'cjk-symbols-and-punctuation',
    name: 'CJK Symbols and Punctuation',
    start: 0x3000,
    end: 0x303f,
  },
  { id: 'hiragana', name: 'Hiragana', start: 0x3040, end: 0x309f },
  { id: 'katakana', name: 'Katakana', start: 0x30a0, end: 0x30ff },
  {
    id: 'enclosed-cjk-letters-and-months',
    name: 'Enclosed CJK Letters and Months',
    start: 0x3200,
    end: 0x32ff,
  },
  { id: 'cjk-compatibility', name: 'CJK Compatibility', start: 0x3300, end: 0x33ff },
  { id: 'cjk-unified-ideographs', name: 'CJK Unified Ideographs', start: 0x4e00, end: 0x9fff },
  { id: 'hangul-syllables', name: 'Hangul Syllables', start: 0xac00, end: 0xd7af },
  {
    id: 'alphabetic-presentation-forms',
    name: 'Alphabetic Presentation Forms',
    start: 0xfb00,
    end: 0xfb4f,
  },
  {
    id: 'halfwidth-and-fullwidth-forms',
    name: 'Halfwidth and Fullwidth Forms',
    start: 0xff00,
    end: 0xffef,
  },
  { id: 'specials', name: 'Specials', start: 0xfff0, end: 0xffff },
  { id: 'musical-symbols', name: 'Musical Symbols', start: 0x1d100, end: 0x1d1ff },
  {
    id: 'mathematical-alphanumeric-symbols',
    name: 'Mathematical Alphanumeric Symbols',
    start: 0x1d400,
    end: 0x1d7ff,
  },
];

/** The block the map opens on: the dashes and quotation marks a keyboard lacks. */
export const DEFAULT_BLOCK = 'general-punctuation';

const BY_ID = new Map(BLOCKS.map((block) => [block.id, block]));

export function blockById(id: string): UnicodeBlock | null {
  return BY_ID.get(id) ?? null;
}

export function isBlockId(value: unknown): value is string {
  return typeof value === 'string' && BY_ID.has(value);
}

/** How many code points a block covers, assigned or not. */
export function blockSize(block: UnicodeBlock): number {
  return block.end - block.start + 1;
}

/** `U+2000–U+206F`, with an en dash, as Unicode prints a range. */
export function formatBlockRange(block: UnicodeBlock): string {
  return `${formatCodePoint(block.start)}–${formatCodePoint(block.end)}`;
}

/**
 * The listed block a code point falls in, or null. A character found by
 * search may sit outside every block in the table; the detail pane then says
 * nothing about its block rather than naming the nearest one.
 */
export function blockOf(codePoint: number): UnicodeBlock | null {
  let low = 0;
  let high = BLOCKS.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const block = BLOCKS[mid];
    if (!block) break;
    if (codePoint < block.start) high = mid - 1;
    else if (codePoint > block.end) low = mid + 1;
    else return block;
  }
  return null;
}

/** The block `steps` along from `id`, stopping at either end of the list. */
export function stepBlock(id: string, steps: number): string {
  const index = BLOCKS.findIndex((block) => block.id === id);
  if (index < 0) return DEFAULT_BLOCK;
  const next = Math.min(BLOCKS.length - 1, Math.max(0, index + steps));
  return BLOCKS[next]?.id ?? id;
}
