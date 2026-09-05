import { describe, expect, it } from 'vitest';
import { CodecError, codecSupport, deflateRaw, inflateRaw } from './codec';
import { FIXTURE_LONG_TEXT, fixtureArchive } from './fixture';
import { readZip, storedBytes } from './zip';

const bytes = (value: string) => new TextEncoder().encode(value);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

describe('codecSupport', () => {
  it('reports what the running platform has', () => {
    expect(codecSupport()).toEqual({ deflate: true, inflate: true });
  });

  it('reports a platform with neither', () => {
    expect(codecSupport({})).toEqual({ deflate: false, inflate: false });
  });

  it('reports each half separately', () => {
    expect(codecSupport({ CompressionStream })).toEqual({ deflate: true, inflate: false });
    expect(codecSupport({ DecompressionStream })).toEqual({ deflate: false, inflate: true });
  });
});

describe('deflateRaw and inflateRaw', () => {
  it('round-trips text', async () => {
    const source = bytes(FIXTURE_LONG_TEXT);
    const packed = await deflateRaw(source);
    expect(packed.length).toBeLessThan(source.length);
    expect(text(await inflateRaw(packed))).toBe(FIXTURE_LONG_TEXT);
  });

  it('round-trips bytes that do not compress', async () => {
    const noise = new Uint8Array(2048);
    for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 37 + (i % 7)) & 0xff;
    expect(await inflateRaw(await deflateRaw(noise))).toEqual(noise);
  });

  it('round-trips the empty input', async () => {
    expect(await inflateRaw(await deflateRaw(new Uint8Array(0)))).toEqual(new Uint8Array(0));
  });

  it('inflates a stream another tool deflated', async () => {
    const zip = fixtureArchive();
    const entry = readZip(zip).entries[1];
    expect(entry).toBeDefined();
    const inflated = await inflateRaw(storedBytes(zip, entry as NonNullable<typeof entry>));
    expect(text(inflated)).toBe(FIXTURE_LONG_TEXT);
  });

  it('produces a raw stream, with no zlib header in front of it', async () => {
    const packed = await deflateRaw(bytes('hello hello hello'));
    // 0x78 is the zlib CMF byte; a raw stream must not start with one.
    expect(packed[0]).not.toBe(0x78);
  });

  it('reports damaged compressed data instead of returning nonsense', async () => {
    await expect(inflateRaw(bytes('not a deflate stream at all'))).rejects.toBeInstanceOf(
      CodecError,
    );
    await expect(inflateRaw(bytes('not a deflate stream at all'))).rejects.toThrow(/Damaged/);
  });

  it('says which half a platform is missing', async () => {
    await expect(deflateRaw(bytes('x'), {})).rejects.toThrow(/no CompressionStream/);
    await expect(inflateRaw(bytes('x'), {})).rejects.toThrow(/no DecompressionStream/);
    await expect(deflateRaw(bytes('x'), {})).rejects.toBeInstanceOf(CodecError);
  });
});
