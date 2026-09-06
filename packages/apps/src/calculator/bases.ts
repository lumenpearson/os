/**
 * Programmer-mode integers. Values are `BigInt`, so a 64-bit word is exact,
 * and every operation is wrapped to the current word size as two's
 * complement: DEC shows the signed value, HEX/OCT/BIN show the bit pattern.
 */

export type Base = 'hex' | 'dec' | 'oct' | 'bin';
export type WordSize = 8 | 16 | 32 | 64;

export const BASES: readonly Base[] = ['hex', 'dec', 'oct', 'bin'];
export const WORD_SIZES: readonly WordSize[] = [8, 16, 32, 64];

export const BASE_LABEL: Record<Base, string> = {
  hex: 'HEX',
  dec: 'DEC',
  oct: 'OCT',
  bin: 'BIN',
};

export const RADIX: Record<Base, number> = { hex: 16, dec: 10, oct: 8, bin: 2 };

const DIGITS: Record<Base, string> = {
  hex: '0123456789ABCDEF',
  dec: '0123456789',
  oct: '01234567',
  // A radix alphabet: base two has a zero and a one. Not a numbered section,
  // which is what the design scan reads two digits in quotes as.
  // deslop-ignore-next-line 30
  bin: '01',
};

/** Written form of a base, so a tape line says which one it was. */
export const BASE_PREFIX: Record<Base, string> = { hex: '0x', dec: '', oct: '0o', bin: '0b' };

/** Digits between separators when a value is grouped for reading. */
const GROUP: Record<Base, number> = { hex: 4, dec: 3, oct: 3, bin: 4 };

const bits = (size: WordSize): bigint => BigInt(size);
const span = (size: WordSize): bigint => 1n << bits(size);

/** Wrap to the signed range of the word size, the way hardware does. */
export function wrap(value: bigint, size: WordSize): bigint {
  const modulus = span(size);
  const unsigned = ((value % modulus) + modulus) % modulus;
  return unsigned >= modulus >> 1n ? unsigned - modulus : unsigned;
}

/** The bit pattern of a value, as a non-negative integer. */
export function toUnsigned(value: bigint, size: WordSize): bigint {
  const modulus = span(size);
  return ((value % modulus) + modulus) % modulus;
}

export function isDigitOfBase(character: string, base: Base): boolean {
  return DIGITS[base].includes(character.toUpperCase());
}

/** Drop every character that is not a digit of the base. */
export function filterDigits(text: string, base: Base): string {
  return text
    .toUpperCase()
    .split('')
    .filter((c) => isDigitOfBase(c, base))
    .join('');
}

/** How many digits of a base a word of this size can hold. */
export function maxDigits(base: Base, size: WordSize): number {
  if (base === 'dec') return String(span(size) - 1n).length;
  return Math.ceil(size / Math.log2(RADIX[base]));
}

/** Parse digits written in a base. Returns null when the text is not a number. */
export function parseBase(text: string, base: Base): bigint | null {
  const trimmed = text.trim().replace(/[\s,_]/g, '');
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  if (body.length === 0) return null;
  for (const character of body) if (!isDigitOfBase(character, base)) return null;
  try {
    const value = BigInt(`${BASE_PREFIX[base]}${base === 'dec' ? body : body.toUpperCase()}`);
    return negative ? -value : value;
  } catch {
    return null;
  }
}

export interface BaseFormatOptions {
  group?: boolean;
}

/** Render a value in a base: signed in DEC, as a bit pattern elsewhere. */
export function formatBase(
  value: bigint,
  base: Base,
  size: WordSize,
  options: BaseFormatOptions = {},
): string {
  const text =
    base === 'dec'
      ? wrap(value, size).toString(10)
      : toUnsigned(value, size).toString(RADIX[base]).toUpperCase();
  return options.group ? groupBase(text, base) : text;
}

/** Space digits into blocks so a 64-bit word can be read. */
export function groupBase(text: string, base: Base, separator = ' '): string {
  const sign = text.startsWith('-') ? '-' : '';
  const body = sign ? text.slice(1) : text;
  const size = GROUP[base];
  const blocks: string[] = [];
  for (let end = body.length; end > 0; end -= size)
    blocks.unshift(body.slice(Math.max(0, end - size), end));
  return sign + blocks.join(base === 'dec' ? ',' : separator);
}

// ── operations ────────────────────────────────────────────────────────────

export type BitwiseOp = 'and' | 'or' | 'xor';
export type ArithmeticOp = 'add' | 'sub' | 'mul' | 'div' | 'mod';
export type ShiftOp = 'shl' | 'shr' | 'rol' | 'ror';
export type ProgrammerOp = BitwiseOp | ArithmeticOp | ShiftOp;

export function not(value: bigint, size: WordSize): bigint {
  return wrap(~value, size);
}

export function negate(value: bigint, size: WordSize): bigint {
  return wrap(-value, size);
}

export function shiftLeft(value: bigint, amount: bigint, size: WordSize): bigint {
  if (amount < 0n) return shiftRight(value, -amount, size);
  if (amount >= bits(size)) return 0n;
  return wrap(value << amount, size);
}

/** Arithmetic shift: the sign bit is copied in, matching the signed value. */
export function shiftRight(value: bigint, amount: bigint, size: WordSize): bigint {
  if (amount < 0n) return shiftLeft(value, -amount, size);
  const signed = wrap(value, size);
  if (amount >= bits(size)) return signed < 0n ? wrap(-1n, size) : 0n;
  return wrap(signed >> amount, size);
}

export function rotateLeft(value: bigint, amount: bigint, size: WordSize): bigint {
  const width = bits(size);
  const by = ((amount % width) + width) % width;
  const pattern = toUnsigned(value, size);
  if (by === 0n) return wrap(pattern, size);
  return wrap((pattern << by) | (pattern >> (width - by)), size);
}

export function rotateRight(value: bigint, amount: bigint, size: WordSize): bigint {
  return rotateLeft(value, -amount, size);
}

/**
 * Apply a binary operation inside the word size. Returns null when the
 * operation has no answer (division by zero).
 */
export function applyOp(
  op: ProgrammerOp,
  left: bigint,
  right: bigint,
  size: WordSize,
): bigint | null {
  switch (op) {
    case 'add':
      return wrap(left + right, size);
    case 'sub':
      return wrap(left - right, size);
    case 'mul':
      return wrap(left * right, size);
    case 'div':
      return right === 0n ? null : wrap(left / right, size);
    case 'mod':
      return right === 0n ? null : wrap(left % right, size);
    case 'and':
      return wrap(left & right, size);
    case 'or':
      return wrap(left | right, size);
    case 'xor':
      return wrap(left ^ right, size);
    case 'shl':
      return shiftLeft(left, right, size);
    case 'shr':
      return shiftRight(left, right, size);
    case 'rol':
      return rotateLeft(left, right, size);
    case 'ror':
      return rotateRight(left, right, size);
  }
}
