import { describe, expect, it } from 'vitest';
import { type Digester, hashText, platformDigester } from './hash';

interface Call {
  algorithm: string;
  data: number[];
}

/** Stands in for crypto.subtle: records the call and returns fixed bytes. */
const stub = (bytes: number[]): Digester & { calls: Call[] } => {
  const calls: Call[] = [];
  return {
    calls,
    digest(algorithm, data) {
      const view =
        data instanceof ArrayBuffer
          ? new Uint8Array(data)
          : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      calls.push({ algorithm, data: [...view] });
      return Promise.resolve(new Uint8Array(bytes).buffer);
    },
  };
};

describe('hashText', () => {
  it('hex-encodes the digest with two digits a byte', async () => {
    const digester = stub([0x00, 0x0f, 0xa0, 0xff]);
    await expect(hashText('SHA-256', 'x', digester)).resolves.toEqual({
      ok: true,
      hex: '000fa0ff',
    });
  });

  it('passes the algorithm through and hands over UTF-8 bytes', async () => {
    const digester = stub([1]);
    await hashText('SHA-512', '\u{1f680}', digester);
    expect(digester.calls[0]?.algorithm).toBe('SHA-512');
    expect(digester.calls[0]?.data).toEqual([0xf0, 0x9f, 0x9a, 0x80]);
  });

  it('refuses a lone surrogate instead of hashing replacement characters', async () => {
    const digester = stub([1]);
    const result = await hashText('SHA-1', 'a\ud83dz', digester);
    expect(result.ok).toBe(false);
    expect(digester.calls).toHaveLength(0);
  });

  it('reports a missing crypto.subtle rather than throwing', async () => {
    await expect(hashText('SHA-256', 'x', null)).resolves.toEqual({
      ok: false,
      error: 'This platform does not offer crypto.subtle for hashing',
    });
  });

  it('turns a rejected digest into a message', async () => {
    const failing: Digester = { digest: () => Promise.reject(new Error('nope')) };
    await expect(hashText('SHA-256', 'x', failing)).resolves.toEqual({
      ok: false,
      error: 'nope',
    });
  });

  it('agrees with the platform on the known SHA-256 of "abc"', async () => {
    const digester = platformDigester();
    if (!digester) return;
    await expect(hashText('SHA-256', 'abc', digester)).resolves.toEqual({
      ok: true,
      hex: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    });
  });
});
