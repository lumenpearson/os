import { describe, expect, it } from 'vitest';
import {
  applyOp,
  BASE_LABEL,
  BASES,
  filterDigits,
  formatBase,
  groupBase,
  isDigitOfBase,
  maxDigits,
  negate,
  not,
  parseBase,
  RADIX,
  rotateLeft,
  rotateRight,
  shiftLeft,
  shiftRight,
  toUnsigned,
  WORD_SIZES,
  wrap,
} from './bases';

const U64_MAX = 18446744073709551615n;
const I64_MIN = -9223372036854775808n;
const I64_MAX = 9223372036854775807n;

describe('wrap', () => {
  it('leaves a value inside the signed range alone', () => {
    expect(wrap(0n, 8)).toBe(0n);
    expect(wrap(127n, 8)).toBe(127n);
    expect(wrap(-128n, 8)).toBe(-128n);
    expect(wrap(1234n, 16)).toBe(1234n);
  });

  it('wraps past the top of the word the way hardware does', () => {
    expect(wrap(128n, 8)).toBe(-128n);
    expect(wrap(255n, 8)).toBe(-1n);
    expect(wrap(256n, 8)).toBe(0n);
    expect(wrap(-129n, 8)).toBe(127n);
    expect(wrap(32768n, 16)).toBe(-32768n);
    expect(wrap(4294967295n, 32)).toBe(-1n);
  });

  it('is exact at the edges of a 64-bit word', () => {
    expect(wrap(I64_MAX, 64)).toBe(I64_MAX);
    expect(wrap(I64_MAX + 1n, 64)).toBe(I64_MIN);
    expect(wrap(U64_MAX, 64)).toBe(-1n);
    expect(wrap(U64_MAX + 1n, 64)).toBe(0n);
    expect(wrap(I64_MIN - 1n, 64)).toBe(I64_MAX);
  });
});

describe('toUnsigned', () => {
  it('gives the bit pattern of a negative value', () => {
    expect(toUnsigned(-1n, 8)).toBe(255n);
    expect(toUnsigned(-1n, 16)).toBe(65535n);
    expect(toUnsigned(-1n, 32)).toBe(4294967295n);
    expect(toUnsigned(-1n, 64)).toBe(U64_MAX);
    expect(toUnsigned(I64_MIN, 64)).toBe(9223372036854775808n);
  });

  it('leaves a value that is already positive alone', () => {
    expect(toUnsigned(5n, 8)).toBe(5n);
    expect(toUnsigned(I64_MAX, 64)).toBe(I64_MAX);
  });
});

describe('digits of a base', () => {
  it('knows which characters belong to which base', () => {
    expect(isDigitOfBase('9', 'dec')).toBe(true);
    expect(isDigitOfBase('A', 'dec')).toBe(false);
    expect(isDigitOfBase('f', 'hex')).toBe(true);
    expect(isDigitOfBase('G', 'hex')).toBe(false);
    expect(isDigitOfBase('7', 'oct')).toBe(true);
    expect(isDigitOfBase('8', 'oct')).toBe(false);
    expect(isDigitOfBase('1', 'bin')).toBe(true);
    expect(isDigitOfBase('2', 'bin')).toBe(false);
  });

  it('drops everything that is not a digit of the base', () => {
    expect(filterDigits('de ad!', 'hex')).toBe('DEAD');
    expect(filterDigits('12a3', 'dec')).toBe('123');
    expect(filterDigits('0b1012', 'bin')).toBe('0101');
  });

  it('counts the digits a word can hold', () => {
    expect(maxDigits('bin', 8)).toBe(8);
    expect(maxDigits('bin', 64)).toBe(64);
    expect(maxDigits('hex', 8)).toBe(2);
    expect(maxDigits('hex', 64)).toBe(16);
    expect(maxDigits('oct', 32)).toBe(11);
    expect(maxDigits('dec', 8)).toBe(3);
    expect(maxDigits('dec', 64)).toBe(20);
  });

  it('labels every base and gives its radix', () => {
    expect(BASES).toEqual(['hex', 'dec', 'oct', 'bin']);
    expect(WORD_SIZES).toEqual([8, 16, 32, 64]);
    expect(BASE_LABEL.hex).toBe('HEX');
    expect(RADIX).toEqual({ hex: 16, dec: 10, oct: 8, bin: 2 });
  });
});

describe('parseBase', () => {
  it('reads digits written in each base', () => {
    expect(parseBase('FF', 'hex')).toBe(255n);
    expect(parseBase('ff', 'hex')).toBe(255n);
    expect(parseBase('255', 'dec')).toBe(255n);
    expect(parseBase('377', 'oct')).toBe(255n);
    expect(parseBase('11111111', 'bin')).toBe(255n);
  });

  it('reads a 64-bit word exactly', () => {
    expect(parseBase('FFFFFFFFFFFFFFFF', 'hex')).toBe(U64_MAX);
    expect(parseBase('18446744073709551615', 'dec')).toBe(U64_MAX);
    expect(parseBase('8000000000000000', 'hex')).toBe(9223372036854775808n);
    expect(parseBase('1'.repeat(64), 'bin')).toBe(U64_MAX);
  });

  it('tolerates spaces and separators and a leading minus', () => {
    expect(parseBase(' DE AD ', 'hex')).toBe(57005n);
    expect(parseBase('1,234', 'dec')).toBe(1234n);
    expect(parseBase('-1F', 'hex')).toBe(-31n);
  });

  it('refuses text that is not a number in the base', () => {
    expect(parseBase('', 'dec')).toBeNull();
    expect(parseBase('   ', 'dec')).toBeNull();
    expect(parseBase('-', 'dec')).toBeNull();
    expect(parseBase('2', 'bin')).toBeNull();
    expect(parseBase('8', 'oct')).toBeNull();
    expect(parseBase('G', 'hex')).toBeNull();
    expect(parseBase('12.5', 'dec')).toBeNull();
  });
});

describe('formatBase', () => {
  it('shows the signed value in decimal and the bit pattern elsewhere', () => {
    expect(formatBase(-1n, 'dec', 8)).toBe('-1');
    expect(formatBase(-1n, 'hex', 8)).toBe('FF');
    expect(formatBase(-1n, 'oct', 8)).toBe('377');
    expect(formatBase(-1n, 'bin', 8)).toBe('11111111');
  });

  it('masks a value to the word size', () => {
    expect(formatBase(300n, 'dec', 8)).toBe('44');
    expect(formatBase(300n, 'hex', 8)).toBe('2C');
    expect(formatBase(300n, 'hex', 16)).toBe('12C');
    expect(formatBase(65535n, 'dec', 16)).toBe('-1');
    expect(formatBase(65535n, 'dec', 32)).toBe('65535');
  });

  it('is exact for a 64-bit word', () => {
    expect(formatBase(-1n, 'hex', 64)).toBe('FFFFFFFFFFFFFFFF');
    expect(formatBase(-1n, 'dec', 64)).toBe('-1');
    expect(formatBase(-1n, 'bin', 64)).toBe('1'.repeat(64));
    expect(formatBase(I64_MIN, 'hex', 64)).toBe('8000000000000000');
    expect(formatBase(I64_MAX, 'dec', 64)).toBe('9223372036854775807');
    expect(formatBase(U64_MAX, 'dec', 64)).toBe('-1');
  });

  it('groups digits for reading on request', () => {
    expect(formatBase(-1n, 'bin', 8, { group: true })).toBe('1111 1111');
    expect(formatBase(1234567n, 'dec', 32, { group: true })).toBe('1,234,567');
  });
});

describe('groupBase', () => {
  it('blocks binary and hex in fours and decimal in threes', () => {
    expect(groupBase('11110000', 'bin')).toBe('1111 0000');
    expect(groupBase('101', 'bin')).toBe('101');
    expect(groupBase('DEADBEEF', 'hex')).toBe('DEAD BEEF');
    expect(groupBase('1234567', 'dec')).toBe('1,234,567');
    expect(groupBase('7654321', 'oct')).toBe('7 654 321');
  });

  it('keeps a leading minus outside the blocks', () => {
    expect(groupBase('-1234567', 'dec')).toBe('-1,234,567');
  });
});

describe('bitwise operations', () => {
  it('complements inside the word', () => {
    expect(not(0n, 8)).toBe(-1n);
    expect(not(-1n, 8)).toBe(0n);
    expect(formatBase(not(0x0fn, 8), 'hex', 8)).toBe('F0');
    expect(not(0n, 64)).toBe(-1n);
  });

  it('negates inside the word', () => {
    expect(negate(5n, 8)).toBe(-5n);
    expect(negate(-128n, 8)).toBe(-128n);
    expect(negate(I64_MIN, 64)).toBe(I64_MIN);
  });

  it('ands, ors and xors', () => {
    expect(applyOp('and', 0b1100n, 0b1010n, 8)).toBe(0b1000n);
    expect(applyOp('or', 0b1100n, 0b1010n, 8)).toBe(0b1110n);
    expect(applyOp('xor', 0b1100n, 0b1010n, 8)).toBe(0b0110n);
    expect(applyOp('and', -1n, 0xffn, 64)).toBe(255n);
    expect(applyOp('xor', -1n, -1n, 64)).toBe(0n);
  });
});

describe('shifts and rotates', () => {
  it('shifts left and drops the bits that fall off the top', () => {
    expect(shiftLeft(1n, 3n, 8)).toBe(8n);
    expect(shiftLeft(1n, 7n, 8)).toBe(-128n);
    expect(shiftLeft(1n, 8n, 8)).toBe(0n);
    expect(shiftLeft(1n, 63n, 64)).toBe(I64_MIN);
    expect(shiftLeft(1n, 64n, 64)).toBe(0n);
    expect(toUnsigned(shiftLeft(3n, 62n, 64), 64)).toBe(13835058055282163712n);
  });

  it('shifts right and copies the sign bit in', () => {
    expect(shiftRight(8n, 3n, 8)).toBe(1n);
    expect(shiftRight(-8n, 1n, 8)).toBe(-4n);
    expect(shiftRight(-1n, 4n, 8)).toBe(-1n);
    expect(shiftRight(-1n, 99n, 64)).toBe(-1n);
    expect(shiftRight(1n, 99n, 64)).toBe(0n);
    expect(shiftRight(I64_MIN, 63n, 64)).toBe(-1n);
  });

  it('reads a negative shift as a shift the other way', () => {
    expect(shiftLeft(8n, -3n, 8)).toBe(1n);
    expect(shiftRight(1n, -3n, 8)).toBe(8n);
  });

  it('rotates around the word', () => {
    expect(toUnsigned(rotateLeft(0x80n, 1n, 8), 8)).toBe(1n);
    expect(toUnsigned(rotateRight(1n, 1n, 8), 8)).toBe(128n);
    expect(toUnsigned(rotateLeft(0x12345678n, 8n, 32), 32)).toBe(0x34567812n);
    expect(toUnsigned(rotateRight(1n, 1n, 64), 64)).toBe(9223372036854775808n);
  });

  it('leaves a value alone when it rotates a whole turn', () => {
    expect(rotateLeft(0b1011n, 0n, 8)).toBe(0b1011n);
    expect(rotateLeft(0b1011n, 8n, 8)).toBe(0b1011n);
    expect(rotateLeft(0b1011n, 16n, 8)).toBe(0b1011n);
    expect(rotateRight(12345n, 64n, 64)).toBe(12345n);
  });
});

describe('applyOp', () => {
  it('adds, subtracts and multiplies inside the word', () => {
    expect(applyOp('add', 127n, 1n, 8)).toBe(-128n);
    expect(applyOp('sub', -128n, 1n, 8)).toBe(127n);
    expect(applyOp('mul', 16n, 16n, 8)).toBe(0n);
    expect(applyOp('mul', 16n, 16n, 16)).toBe(256n);
    expect(applyOp('add', 100n, 200n, 16)).toBe(300n);
  });

  it('is exact where a double would already have lost digits', () => {
    expect(applyOp('add', I64_MAX, 1n, 64)).toBe(I64_MIN);
    expect(applyOp('mul', 3037000500n, 3037000500n, 64)).toBe(-9223372036709301616n);
    expect(applyOp('sub', I64_MAX, 1n, 64)).toBe(9223372036854775806n);
    expect(applyOp('add', 9007199254740993n, 1n, 64)).toBe(9007199254740994n);
  });

  it('divides towards zero and takes the remainder', () => {
    expect(applyOp('div', 7n, 2n, 8)).toBe(3n);
    expect(applyOp('div', -7n, 2n, 8)).toBe(-3n);
    expect(applyOp('mod', 7n, 3n, 8)).toBe(1n);
    expect(applyOp('mod', -7n, 3n, 8)).toBe(-1n);
  });

  it('has no answer for division by zero', () => {
    expect(applyOp('div', 1n, 0n, 32)).toBeNull();
    expect(applyOp('mod', 1n, 0n, 32)).toBeNull();
  });

  it('routes the shifts and rotates through the same door', () => {
    expect(applyOp('shl', 1n, 4n, 8)).toBe(16n);
    expect(applyOp('shr', 16n, 4n, 8)).toBe(1n);
    expect(applyOp('rol', 0x80n, 1n, 8)).toBe(1n);
    expect(applyOp('ror', 1n, 1n, 8)).toBe(-128n);
  });
});

describe('a value survives a round trip through every base and word size', () => {
  it('parses back what it formatted', () => {
    for (const size of WORD_SIZES) {
      for (const base of BASES) {
        for (const value of [0n, 1n, -1n, 42n, -42n, I64_MIN, I64_MAX, U64_MAX]) {
          const masked = wrap(value, size);
          const text = formatBase(masked, base, size);
          const parsed = parseBase(text, base);
          expect(parsed).not.toBeNull();
          expect(wrap(parsed ?? 0n, size)).toBe(masked);
          expect(text.length).toBeLessThanOrEqual(maxDigits(base, size) + (masked < 0n ? 1 : 0));
        }
      }
    }
  });
});
