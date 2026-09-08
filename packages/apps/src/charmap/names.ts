/**
 * Character names, written out by hand.
 *
 * There is no Unicode character database here to look a name up in, and a
 * plausible-sounding name is worse than none: it would be read as fact. So
 * this file holds only names that were stated deliberately and can be
 * vouched for — the ASCII letters and digits, the Greek alphabet, and a list
 * of punctuation, currency, arrow, maths and symbol characters people
 * actually go looking for. Everything else has no name in this app, and the
 * detail pane shows nothing where the name would be.
 *
 * The three generated groups follow naming patterns Unicode applies without
 * exception across their ranges. U+03A2 is skipped because it is reserved,
 * and U+03C2 is the final sigma, which is the one irregular name in Greek.
 */

type Named = [codePoint: number, name: string];

const CAPITALS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGIT_NAMES = [
  'ZERO',
  'ONE',
  'TWO',
  'THREE',
  'FOUR',
  'FIVE',
  'SIX',
  'SEVEN',
  'EIGHT',
  'NINE',
];
const GREEK_LETTERS = [
  'ALPHA',
  'BETA',
  'GAMMA',
  'DELTA',
  'EPSILON',
  'ZETA',
  'ETA',
  'THETA',
  'IOTA',
  'KAPPA',
  'LAMDA',
  'MU',
  'NU',
  'XI',
  'OMICRON',
  'PI',
  'RHO',
  'SIGMA',
  'TAU',
  'UPSILON',
  'PHI',
  'CHI',
  'PSI',
  'OMEGA',
];

function generated(): Named[] {
  const out: Named[] = [];
  for (let i = 0; i < 26; i += 1) {
    const letter = CAPITALS[i] as string;
    out.push([0x41 + i, `LATIN CAPITAL LETTER ${letter}`]);
    out.push([0x61 + i, `LATIN SMALL LETTER ${letter}`]);
  }
  for (let i = 0; i < 10; i += 1) {
    out.push([0x30 + i, `DIGIT ${DIGIT_NAMES[i] as string}`]);
  }
  // Capitals run U+0391 to U+03A9 with U+03A2 reserved; the small letters run
  // U+03B1 to U+03C9 with the final sigma sitting at U+03C2.
  GREEK_LETTERS.forEach((letter, i) => {
    const offset = i < 17 ? i : i + 1;
    out.push([0x391 + offset, `GREEK CAPITAL LETTER ${letter}`]);
    out.push([0x3b1 + offset, `GREEK SMALL LETTER ${letter}`]);
  });
  out.push([0x3c2, 'GREEK SMALL LETTER FINAL SIGMA']);
  return out;
}

const CURATED: readonly Named[] = [
  // Basic Latin punctuation.
  [0x20, 'SPACE'],
  [0x21, 'EXCLAMATION MARK'],
  [0x22, 'QUOTATION MARK'],
  [0x23, 'NUMBER SIGN'],
  [0x24, 'DOLLAR SIGN'],
  [0x25, 'PERCENT SIGN'],
  [0x26, 'AMPERSAND'],
  [0x27, 'APOSTROPHE'],
  [0x28, 'LEFT PARENTHESIS'],
  [0x29, 'RIGHT PARENTHESIS'],
  [0x2a, 'ASTERISK'],
  [0x2b, 'PLUS SIGN'],
  [0x2c, 'COMMA'],
  [0x2d, 'HYPHEN-MINUS'],
  [0x2e, 'FULL STOP'],
  [0x2f, 'SOLIDUS'],
  [0x3a, 'COLON'],
  [0x3b, 'SEMICOLON'],
  [0x3c, 'LESS-THAN SIGN'],
  [0x3d, 'EQUALS SIGN'],
  [0x3e, 'GREATER-THAN SIGN'],
  [0x3f, 'QUESTION MARK'],
  [0x40, 'COMMERCIAL AT'],
  [0x5b, 'LEFT SQUARE BRACKET'],
  [0x5c, 'REVERSE SOLIDUS'],
  [0x5d, 'RIGHT SQUARE BRACKET'],
  [0x5e, 'CIRCUMFLEX ACCENT'],
  [0x5f, 'LOW LINE'],
  [0x60, 'GRAVE ACCENT'],
  [0x7b, 'LEFT CURLY BRACKET'],
  [0x7c, 'VERTICAL LINE'],
  [0x7d, 'RIGHT CURLY BRACKET'],
  [0x7e, 'TILDE'],

  // Latin-1 Supplement symbols.
  [0xa0, 'NO-BREAK SPACE'],
  [0xa1, 'INVERTED EXCLAMATION MARK'],
  [0xa2, 'CENT SIGN'],
  [0xa3, 'POUND SIGN'],
  [0xa4, 'CURRENCY SIGN'],
  [0xa5, 'YEN SIGN'],
  [0xa6, 'BROKEN BAR'],
  [0xa7, 'SECTION SIGN'],
  [0xa8, 'DIAERESIS'],
  [0xa9, 'COPYRIGHT SIGN'],
  [0xaa, 'FEMININE ORDINAL INDICATOR'],
  [0xab, 'LEFT-POINTING DOUBLE ANGLE QUOTATION MARK'],
  [0xac, 'NOT SIGN'],
  [0xad, 'SOFT HYPHEN'],
  [0xae, 'REGISTERED SIGN'],
  [0xaf, 'MACRON'],
  [0xb0, 'DEGREE SIGN'],
  [0xb1, 'PLUS-MINUS SIGN'],
  [0xb2, 'SUPERSCRIPT TWO'],
  [0xb3, 'SUPERSCRIPT THREE'],
  [0xb4, 'ACUTE ACCENT'],
  [0xb5, 'MICRO SIGN'],
  [0xb6, 'PILCROW SIGN'],
  [0xb7, 'MIDDLE DOT'],
  [0xb8, 'CEDILLA'],
  [0xb9, 'SUPERSCRIPT ONE'],
  [0xba, 'MASCULINE ORDINAL INDICATOR'],
  [0xbb, 'RIGHT-POINTING DOUBLE ANGLE QUOTATION MARK'],
  [0xbc, 'VULGAR FRACTION ONE QUARTER'],
  [0xbd, 'VULGAR FRACTION ONE HALF'],
  [0xbe, 'VULGAR FRACTION THREE QUARTERS'],
  [0xbf, 'INVERTED QUESTION MARK'],
  [0xd7, 'MULTIPLICATION SIGN'],
  [0xdf, 'LATIN SMALL LETTER SHARP S'],
  [0xe6, 'LATIN SMALL LETTER AE'],
  [0xf7, 'DIVISION SIGN'],
  [0xf8, 'LATIN SMALL LETTER O WITH STROKE'],
  [0x152, 'LATIN CAPITAL LIGATURE OE'],
  [0x153, 'LATIN SMALL LIGATURE OE'],

  // General Punctuation.
  [0x2002, 'EN SPACE'],
  [0x2003, 'EM SPACE'],
  [0x2009, 'THIN SPACE'],
  [0x200b, 'ZERO WIDTH SPACE'],
  [0x200c, 'ZERO WIDTH NON-JOINER'],
  [0x200d, 'ZERO WIDTH JOINER'],
  [0x2010, 'HYPHEN'],
  [0x2013, 'EN DASH'],
  [0x2014, 'EM DASH'],
  [0x2015, 'HORIZONTAL BAR'],
  [0x2018, 'LEFT SINGLE QUOTATION MARK'],
  [0x2019, 'RIGHT SINGLE QUOTATION MARK'],
  [0x201a, 'SINGLE LOW-9 QUOTATION MARK'],
  [0x201c, 'LEFT DOUBLE QUOTATION MARK'],
  [0x201d, 'RIGHT DOUBLE QUOTATION MARK'],
  [0x201e, 'DOUBLE LOW-9 QUOTATION MARK'],
  [0x2020, 'DAGGER'],
  [0x2021, 'DOUBLE DAGGER'],
  [0x2022, 'BULLET'],
  [0x2026, 'HORIZONTAL ELLIPSIS'],
  [0x2030, 'PER MILLE SIGN'],
  [0x2032, 'PRIME'],
  [0x2033, 'DOUBLE PRIME'],
  [0x2039, 'SINGLE LEFT-POINTING ANGLE QUOTATION MARK'],
  [0x203a, 'SINGLE RIGHT-POINTING ANGLE QUOTATION MARK'],
  [0x2044, 'FRACTION SLASH'],
  [0x2060, 'WORD JOINER'],

  // Currency Symbols and Letterlike Symbols.
  [0x20a3, 'FRENCH FRANC SIGN'],
  [0x20a6, 'NAIRA SIGN'],
  [0x20a9, 'WON SIGN'],
  [0x20ac, 'EURO SIGN'],
  [0x20b9, 'INDIAN RUPEE SIGN'],
  [0x20bd, 'RUBLE SIGN'],
  [0x20bf, 'BITCOIN SIGN'],
  [0x2113, 'SCRIPT SMALL L'],
  [0x2116, 'NUMERO SIGN'],
  [0x2117, 'SOUND RECORDING COPYRIGHT'],
  [0x2122, 'TRADE MARK SIGN'],
  [0x212b, 'ANGSTROM SIGN'],

  // Arrows.
  [0x2190, 'LEFTWARDS ARROW'],
  [0x2191, 'UPWARDS ARROW'],
  [0x2192, 'RIGHTWARDS ARROW'],
  [0x2193, 'DOWNWARDS ARROW'],
  [0x2194, 'LEFT RIGHT ARROW'],
  [0x2195, 'UP DOWN ARROW'],
  [0x21a9, 'LEFTWARDS ARROW WITH HOOK'],
  [0x21b5, 'DOWNWARDS ARROW WITH CORNER LEFTWARDS'],
  [0x21d0, 'LEFTWARDS DOUBLE ARROW'],
  [0x21d2, 'RIGHTWARDS DOUBLE ARROW'],
  [0x21d4, 'LEFT RIGHT DOUBLE ARROW'],
  [0x21e7, 'UPWARDS WHITE ARROW'],

  // Mathematical Operators.
  [0x2200, 'FOR ALL'],
  [0x2202, 'PARTIAL DIFFERENTIAL'],
  [0x2203, 'THERE EXISTS'],
  [0x2205, 'EMPTY SET'],
  [0x2206, 'INCREMENT'],
  [0x2207, 'NABLA'],
  [0x2208, 'ELEMENT OF'],
  [0x220f, 'N-ARY PRODUCT'],
  [0x2211, 'N-ARY SUMMATION'],
  [0x2212, 'MINUS SIGN'],
  [0x221a, 'SQUARE ROOT'],
  [0x221e, 'INFINITY'],
  [0x222b, 'INTEGRAL'],
  [0x2248, 'ALMOST EQUAL TO'],
  [0x2260, 'NOT EQUAL TO'],
  [0x2264, 'LESS-THAN OR EQUAL TO'],
  [0x2265, 'GREATER-THAN OR EQUAL TO'],

  // Miscellaneous Technical: the keyboard symbols.
  [0x2303, 'UP ARROWHEAD'],
  [0x2318, 'PLACE OF INTEREST SIGN'],
  [0x2325, 'OPTION KEY'],
  [0x232b, 'ERASE TO THE LEFT'],

  // Box Drawing and Block Elements.
  [0x2500, 'BOX DRAWINGS LIGHT HORIZONTAL'],
  [0x2502, 'BOX DRAWINGS LIGHT VERTICAL'],
  [0x250c, 'BOX DRAWINGS LIGHT DOWN AND RIGHT'],
  [0x2510, 'BOX DRAWINGS LIGHT DOWN AND LEFT'],
  [0x2514, 'BOX DRAWINGS LIGHT UP AND RIGHT'],
  [0x2518, 'BOX DRAWINGS LIGHT UP AND LEFT'],
  [0x2588, 'FULL BLOCK'],
  [0x2591, 'LIGHT SHADE'],
  [0x2592, 'MEDIUM SHADE'],
  [0x2593, 'DARK SHADE'],

  // Geometric Shapes, Miscellaneous Symbols and Dingbats.
  [0x25a0, 'BLACK SQUARE'],
  [0x25a1, 'WHITE SQUARE'],
  [0x25b2, 'BLACK UP-POINTING TRIANGLE'],
  [0x25bc, 'BLACK DOWN-POINTING TRIANGLE'],
  [0x25ca, 'LOZENGE'],
  [0x25cb, 'WHITE CIRCLE'],
  [0x25cf, 'BLACK CIRCLE'],
  [0x2605, 'BLACK STAR'],
  [0x2606, 'WHITE STAR'],
  [0x2660, 'BLACK SPADE SUIT'],
  [0x2663, 'BLACK CLUB SUIT'],
  [0x2665, 'BLACK HEART SUIT'],
  [0x2666, 'BLACK DIAMOND SUIT'],
  [0x2713, 'CHECK MARK'],
  [0x2717, 'BALLOT X'],
];

const BY_CODE_POINT = new Map<number, string>([...generated(), ...CURATED]);

/** The name of a character, or null when this app cannot state one. */
export function characterName(codePoint: number): string | null {
  return BY_CODE_POINT.get(codePoint) ?? null;
}

/**
 * Code points whose name contains every word of the query, in code point
 * order. Only the names above are searched — there is nothing else to search.
 */
export function searchNames(query: string, limit = 300): number[] {
  const words = query
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) return [];
  const hits: number[] = [];
  for (const [codePoint, name] of BY_CODE_POINT) {
    if (words.every((word) => name.includes(word))) hits.push(codePoint);
  }
  return hits.sort((a, b) => a - b).slice(0, limit);
}

/** How many characters this app can name. The test holds the list to a floor. */
export const NAMED_COUNT = BY_CODE_POINT.size;
