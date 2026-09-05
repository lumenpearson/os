/**
 * UUID v4 and ULID.
 *
 * Both take their clock and their randomness as arguments. That is not
 * ceremony: the version and variant bits of a UUID, and the monotonic step a
 * ULID takes when two are asked for in the same millisecond, are exactly the
 * parts worth testing, and neither can be tested against a real random source.
 */

/** Fills a buffer with random bytes. `crypto.getRandomValues` has this shape. */
export type RandomBytes = (length: number) => Uint8Array;

/** The platform's cryptographic random source. */
export const cryptoRandom: RandomBytes = (length) => crypto.getRandomValues(new Uint8Array(length));

const hex = (byte: number) => byte.toString(16).padStart(2, '0');

/**
 * A version 4 UUID: 122 random bits, with the version nibble set to 4 and the
 * two top variant bits set to 10 (RFC 9562 §5.4).
 */
export function uuidV4(random: RandomBytes = cryptoRandom): string {
  const bytes = random(16);
  if (bytes.length < 16) throw new Error('uuidV4 needs 16 random bytes');
  bytes[6] = ((bytes[6] as number) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] as number) & 0x3f) | 0x80;
  const s = [...bytes].map(hex).join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

// ── ULID ──────────────────────────────────────────────────────────────────

/** Crockford's base32: no I, L, O or U, so a written-down id cannot be misread. */
export const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export const TIME_LENGTH = 10;
export const RANDOM_LENGTH = 16;
export const ULID_LENGTH = TIME_LENGTH + RANDOM_LENGTH;

/** The largest instant a 10-character ULID timestamp can hold. */
export const MAX_ULID_TIME = 2 ** 48 - 1;

export function encodeTime(ms: number, length = TIME_LENGTH): string {
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_ULID_TIME)
    throw new RangeError('A ULID timestamp is a whole number of milliseconds within 48 bits');
  let rest = ms;
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out = CROCKFORD.charAt(rest % 32) + out;
    rest = Math.floor(rest / 32);
  }
  return out;
}

/** The instant a ULID was made, for showing beside it. */
export function decodeTime(id: string): number | null {
  if (id.length < TIME_LENGTH) return null;
  let ms = 0;
  for (const ch of id.slice(0, TIME_LENGTH).toUpperCase()) {
    const digit = CROCKFORD.indexOf(ch);
    if (digit === -1) return null;
    ms = ms * 32 + digit;
  }
  return ms > MAX_ULID_TIME ? null : ms;
}

export function encodeRandom(random: RandomBytes, length = RANDOM_LENGTH): string {
  const bytes = random(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += CROCKFORD.charAt((bytes[i] ?? 0) % 32);
  return out;
}

/**
 * The next value in Crockford base32, or `null` when every character is the
 * last one and there is nothing left to carry into.
 */
export function incrementBase32(text: string): string | null {
  const chars = [...text];
  for (let i = chars.length - 1; i >= 0; i -= 1) {
    const digit = CROCKFORD.indexOf(chars[i] as string);
    if (digit === -1) return null;
    if (digit < 31) {
      chars[i] = CROCKFORD.charAt(digit + 1);
      return chars.join('');
    }
    chars[i] = CROCKFORD.charAt(0);
  }
  return null;
}

/**
 * A ULID for `now`. Given the previous id from the same millisecond, the
 * random half is incremented instead of redrawn, so ids made in a tight loop
 * still sort in the order they were made.
 */
export function ulid(now: number, random: RandomBytes = cryptoRandom, previous?: string): string {
  const time = encodeTime(now);
  if (previous && previous.length === ULID_LENGTH && previous.slice(0, TIME_LENGTH) === time) {
    const next = incrementBase32(previous.slice(TIME_LENGTH));
    if (next) return time + next;
  }
  return time + encodeRandom(random);
}

/**
 * A generator that remembers the last id it made, which is what monotonic
 * behaviour needs. One per run of the Generate button.
 */
export function createUlidFactory(options: { now: () => number; random?: RandomBytes }) {
  const random = options.random ?? cryptoRandom;
  let previous: string | undefined;
  return (): string => {
    previous = ulid(options.now(), random, previous);
    return previous;
  };
}

export const ID_KINDS = ['uuid', 'ulid'] as const;

export type IdKind = (typeof ID_KINDS)[number];

export const ID_KIND_LABEL: Record<IdKind, string> = { uuid: 'UUID v4', ulid: 'ULID' };

export interface GenerateOptions {
  kind: IdKind;
  count: number;
  now: () => number;
  random?: RandomBytes;
}

/** A batch, in the order it was generated. */
export function generateIds({ kind, count, now, random }: GenerateOptions): string[] {
  const next = kind === 'uuid' ? () => uuidV4(random) : createUlidFactory({ now, random });
  return Array.from({ length: Math.max(0, count) }, next);
}
