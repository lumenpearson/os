import { describe, expect, it } from 'vitest';
import { crc32, formatCrc } from './crc32';

const ascii = (text: string) => new TextEncoder().encode(text);

describe('crc32', () => {
  it('matches the published check vectors', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(ascii('123456789'))).toBe(0xcbf43926);
    expect(crc32(ascii('a'))).toBe(0xe8b7be43);
    expect(crc32(ascii('The quick brown fox jumps over the lazy dog'))).toBe(0x414fa339);
  });

  it('checksums a run of zero bytes to the value zlib reports', () => {
    expect(crc32(new Uint8Array(32))).toBe(0x190a55ad);
  });

  it('continues across chunks', () => {
    const whole = ascii('the quick brown fox jumps over the lazy dog');
    for (const cut of [0, 1, 7, 20, whole.length - 1, whole.length]) {
      const head = crc32(whole.subarray(0, cut));
      expect(crc32(whole.subarray(cut), head)).toBe(crc32(whole));
    }
  });

  it('leaves a running checksum untouched when handed no bytes', () => {
    const running = crc32(ascii('abc'));
    expect(crc32(new Uint8Array(0), running)).toBe(running);
  });

  it('stays an unsigned 32-bit integer for every byte value', () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) all[i] = i;
    const value = crc32(all);
    expect(Number.isInteger(value)).toBe(true);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(0x100000000);
  });

  it('separates inputs of the same length', () => {
    expect(crc32(ascii('abcd'))).not.toBe(crc32(ascii('abce')));
  });

  it('reads a view into a larger buffer, not the whole buffer', () => {
    const backing = ascii('xx123456789xx');
    expect(crc32(backing.subarray(2, 11))).toBe(0xcbf43926);
  });
});

describe('formatCrc', () => {
  it('prints eight hex digits, padded', () => {
    expect(formatCrc(0xcbf43926)).toBe('cbf43926');
    expect(formatCrc(0)).toBe('00000000');
    expect(formatCrc(0xff)).toBe('000000ff');
  });

  it('prints the unsigned form of a value that arrived signed', () => {
    expect(formatCrc(-1)).toBe('ffffffff');
  });
});
