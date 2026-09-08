import { describe, expect, it } from 'vitest';
import {
  CROCKFORD,
  createUlidFactory,
  decodeTime,
  encodeRandom,
  encodeTime,
  generateIds,
  incrementBase32,
  MAX_ULID_TIME,
  type RandomBytes,
  ULID_LENGTH,
  ulid,
  uuidV4,
} from './ids';

/** A random source that returns the same byte every time. */
const constant =
  (byte: number): RandomBytes =>
  (length) =>
    new Uint8Array(length).fill(byte);

/** A random source that counts up, so every draw differs. */
const counting = (): RandomBytes => {
  let n = 0;
  return (length) =>
    Uint8Array.from({ length }, () => {
      n += 1;
      return n & 0xff;
    });
};

describe('uuidV4', () => {
  it('sets the version nibble to 4 and the variant bits to 10', () => {
    for (const source of [constant(0x00), constant(0xff), counting()]) {
      const id = uuidV4(source);
      expect(id.charAt(14)).toBe('4');
      expect('89ab').toContain(id.charAt(19));
    }
  });

  it('keeps every other bit from the random source', () => {
    expect(uuidV4(constant(0x00))).toBe('00000000-0000-4000-8000-000000000000');
    expect(uuidV4(constant(0xff))).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
  });

  it('lays the hyphens out 8-4-4-4-12 and uses lowercase hex', () => {
    const id = uuidV4(counting());
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(id.length).toBe(36);
  });

  it('refuses a random source that returns too few bytes', () => {
    expect(() => uuidV4(() => new Uint8Array(4))).toThrow('16 random bytes');
  });
});

describe('encodeTime and decodeTime', () => {
  it('writes ten Crockford characters', () => {
    expect(encodeTime(0)).toBe('0000000000');
    // Ten base32 characters hold 50 bits; the ULID spec caps the time at 48.
    expect(encodeTime(MAX_ULID_TIME)).toBe('7ZZZZZZZZZ');
    expect(encodeTime(1469918176385)).toBe('01ARYZ6S41');
  });

  it('round-trips an instant', () => {
    for (const ms of [0, 1, 1_700_000_000_000, MAX_ULID_TIME]) {
      expect(decodeTime(`${encodeTime(ms)}0000000000000000`)).toBe(ms);
    }
  });

  it('refuses an instant it cannot hold', () => {
    expect(() => encodeTime(-1)).toThrow(RangeError);
    expect(() => encodeTime(MAX_ULID_TIME + 1)).toThrow(RangeError);
    expect(() => encodeTime(1.5)).toThrow(RangeError);
  });

  it('returns null for something that is not a ULID', () => {
    expect(decodeTime('short')).toBeNull();
    expect(decodeTime('0000000O0000000000000000')).toBeNull();
  });
});

describe('encodeRandom', () => {
  it('uses only the Crockford alphabet', () => {
    const text = encodeRandom(counting(), 16);
    expect(text).toHaveLength(16);
    expect([...text].every((c) => CROCKFORD.includes(c))).toBe(true);
  });

  it('maps every byte value into the alphabet without bias in the top range', () => {
    expect(encodeRandom(constant(0xff), 2)).toBe('ZZ');
    expect(encodeRandom(constant(0x00), 2)).toBe('00');
  });
});

describe('incrementBase32', () => {
  it('steps the last character', () => {
    expect(incrementBase32('0000')).toBe('0001');
    expect(incrementBase32('0009')).toBe('000A');
  });

  it('carries across the end of the alphabet', () => {
    expect(incrementBase32('000Z')).toBe('0010');
    expect(incrementBase32('0ZZZ')).toBe('1000');
  });

  it('returns null when there is nothing left to carry into', () => {
    expect(incrementBase32('ZZZZ')).toBeNull();
  });

  it('returns null for a character outside the alphabet', () => {
    expect(incrementBase32('000U')).toBeNull();
  });
});

describe('ulid', () => {
  it('is 26 characters of Crockford base32', () => {
    const id = ulid(1_700_000_000_000, counting());
    expect(id).toHaveLength(ULID_LENGTH);
    expect([...id].every((c) => CROCKFORD.includes(c))).toBe(true);
  });

  it('starts with the encoded time', () => {
    const now = 1_700_000_000_000;
    expect(ulid(now, counting()).slice(0, 10)).toBe(encodeTime(now));
  });

  it('increments the previous random half inside the same millisecond', () => {
    const now = 1_700_000_000_000;
    const first = ulid(now, constant(0x00));
    const second = ulid(now, constant(0x00), first);
    expect(first.slice(10)).toBe('0000000000000000');
    expect(second.slice(10)).toBe('0000000000000001');
    expect(second > first).toBe(true);
  });

  it('draws fresh randomness once the millisecond moves on', () => {
    const first = ulid(1_700_000_000_000, constant(0x1f));
    const second = ulid(1_700_000_000_001, constant(0x00), first);
    expect(second.slice(10)).toBe('0000000000000000');
    expect(second > first).toBe(true);
  });

  it('draws fresh randomness rather than failing when the previous half is exhausted', () => {
    const now = 1_700_000_000_000;
    const exhausted = encodeTime(now) + 'Z'.repeat(16);
    expect(ulid(now, constant(0x00), exhausted).slice(10)).toBe('0000000000000000');
  });

  it('ignores a previous id that is not a ULID', () => {
    const now = 1_700_000_000_000;
    expect(ulid(now, constant(0x00), 'nonsense').slice(10)).toBe('0000000000000000');
  });
});

describe('createUlidFactory', () => {
  it('keeps ids in order across a burst inside one millisecond', () => {
    const next = createUlidFactory({ now: () => 1_700_000_000_000, random: constant(0x00) });
    const ids = [next(), next(), next()];
    expect(ids).toEqual([...ids].sort());
    expect(new Set(ids).size).toBe(3);
    expect(ids[2]?.slice(10)).toBe('0000000000000002');
  });

  it('follows the clock forwards', () => {
    let ms = 1_700_000_000_000;
    const next = createUlidFactory({
      now: () => {
        ms += 1;
        return ms;
      },
      random: constant(0x00),
    });
    const ids = [next(), next()];
    expect(ids[0]?.slice(0, 10)).not.toBe(ids[1]?.slice(0, 10));
    expect(ids).toEqual([...ids].sort());
  });
});

describe('generateIds', () => {
  const now = () => 1_700_000_000_000;

  it('generates the number asked for', () => {
    expect(generateIds({ kind: 'uuid', count: 3, now, random: counting() })).toHaveLength(3);
    expect(generateIds({ kind: 'ulid', count: 5, now, random: counting() })).toHaveLength(5);
  });

  it('generates distinct ulids inside one millisecond', () => {
    const ids = generateIds({ kind: 'ulid', count: 4, now, random: constant(0x00) });
    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual([...ids].sort());
  });

  it('returns nothing for a count of zero or less', () => {
    expect(generateIds({ kind: 'uuid', count: 0, now, random: counting() })).toEqual([]);
    expect(generateIds({ kind: 'uuid', count: -3, now, random: counting() })).toEqual([]);
  });
});
