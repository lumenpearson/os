import { describe, expect, it } from 'vitest';
import {
  type DigestResult,
  digestsMatch,
  isDigest,
  sha256Hex,
  subtleCrypto,
  toHex,
} from './digest';

/** The digests in FIPS 180-2, so this is checked against something outside it. */
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function hex(result: DigestResult): string {
  if (!result.ok) throw new Error(`expected a digest: ${result.message}`);
  return result.hex;
}

describe('sha256Hex', () => {
  it('hashes the bytes it is given, in lower-case hex', async () => {
    expect(hex(await sha256Hex(bytes('')))).toBe(EMPTY);
    expect(hex(await sha256Hex(bytes('abc')))).toBe(ABC);
  });

  it('hashes only the view, not the buffer behind it', async () => {
    const buffer = bytes('xxabcxx');
    const view = buffer.subarray(2, 5);
    expect(hex(await sha256Hex(view))).toBe(ABC);
  });

  it('says plainly when the origin has no SubtleCrypto', async () => {
    const result = await sha256Hex(bytes('abc'), null);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unavailable');
    expect(result.message).toContain('secure');
  });

  it('reports a digest that could not be computed', async () => {
    const broken = {
      digest: () => Promise.reject(new Error('no algorithm')),
      // Only `digest` is called; the rest of SubtleCrypto is not this test's business.
    } as unknown as SubtleCrypto;
    const result = await sha256Hex(bytes('abc'), broken);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('failed');
    expect(result.message).toContain('no algorithm');
  });

  it('treats a host without a digest function as one without SubtleCrypto', async () => {
    const empty = {} as unknown as SubtleCrypto;
    const result = await sha256Hex(bytes('abc'), empty);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('unavailable');
  });
});

describe('toHex', () => {
  it('pads every byte to two characters', () => {
    expect(toHex(new Uint8Array([0, 1, 15, 16, 255]).buffer)).toBe('00010f10ff');
    expect(toHex(new Uint8Array(0).buffer)).toBe('');
  });
});

describe('isDigest', () => {
  it('is the shape a sha256 is written in', () => {
    expect(isDigest('a'.repeat(64))).toBe(true);
    expect(isDigest('A'.repeat(64))).toBe(false);
    expect(isDigest('a'.repeat(63))).toBe(false);
    expect(isDigest('')).toBe(false);
  });
});

describe('digestsMatch', () => {
  it('ignores the case a store wrote the digest in', () => {
    expect(digestsMatch(ABC, ABC.toUpperCase())).toBe(true);
    expect(digestsMatch(ABC, EMPTY)).toBe(false);
  });
});

describe('subtleCrypto', () => {
  it('is the host it runs on', () => {
    expect(subtleCrypto()).toBe(globalThis.crypto?.subtle ?? null);
  });
});
