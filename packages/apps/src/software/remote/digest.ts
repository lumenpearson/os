/**
 * The sha256 of what actually arrived.
 *
 * `store/FORMAT.md` checks a payload by size and digest, and the digest is the
 * half that catches a body which is the right length and the wrong bytes. It
 * is computed with `crypto.subtle`, which the browser only exposes on a secure
 * origin: on `http://` there is no SubtleCrypto at all, so this module says so
 * plainly instead of pretending the payload was verified.
 */

/** The SubtleCrypto this host offers, or null on an insecure origin. */
export function subtleCrypto(): SubtleCrypto | null {
  return globalThis.crypto?.subtle ?? null;
}

export type DigestFailure = 'unavailable' | 'failed';

export type DigestResult =
  | { ok: true; hex: string }
  | { ok: false; reason: DigestFailure; message: string };

const UNAVAILABLE =
  'This page cannot compute a checksum, so the download cannot be verified. A store can only be installed from over a secure connection.';

/** Lower-case hex, the form `store/FORMAT.md` writes digests in. */
export function toHex(buffer: ArrayBuffer): string {
  let hex = '';
  for (const byte of new Uint8Array(buffer)) {
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * sha256 of the received bytes, as lower-case hex. `subtle` is a parameter so
 * a caller on a host without one can pass its own, and so the unavailable path
 * can be exercised.
 */
export async function sha256Hex(
  bytes: Uint8Array,
  subtle: SubtleCrypto | null = subtleCrypto(),
): Promise<DigestResult> {
  if (subtle === null || typeof subtle.digest !== 'function') {
    return { ok: false, reason: 'unavailable', message: UNAVAILABLE };
  }
  try {
    // Copied into a plain buffer: bytes read from a stream may be backed by a
    // shared one, which SubtleCrypto will not take.
    const source = new Uint8Array(bytes.byteLength);
    source.set(bytes);
    const digest = await subtle.digest('SHA-256', source);
    return { ok: true, hex: toHex(digest) };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: 'failed',
      message: `The checksum could not be computed: ${detail}`,
    };
  }
}

/** The shape a digest has to have before it is worth comparing. */
export function isDigest(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/** Case-insensitive: a catalogue writing upper-case hex still means the same digest. */
export function digestsMatch(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}
