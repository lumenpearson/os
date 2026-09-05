/**
 * SHA digests through `crypto.subtle`.
 *
 * The maths is the platform's, so nothing here reimplements it. What this
 * layer owns is the part that goes wrong in practice: UTF-8 bytes that refuse
 * a broken string, hex that pads every byte to two digits, and a message
 * rather than a thrown `TypeError` when the page is not on a secure origin
 * and `crypto.subtle` is simply absent.
 */

import { bytesToHex, utf8Bytes } from './encode';

export const HASHES = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'] as const;

export type HashAlgorithm = (typeof HASHES)[number];

/** The part of `SubtleCrypto` this needs, so a test can stand in for it. */
export interface Digester {
  digest(algorithm: string, data: BufferSource): Promise<ArrayBuffer>;
}

export type Digest = { ok: true; hex: string } | { ok: false; error: string };

/** The platform's implementation, or null where it is not available. */
export function platformDigester(): Digester | null {
  const subtle = globalThis.crypto?.subtle;
  return typeof subtle?.digest === 'function' ? subtle : null;
}

/** Hex digest of `text`. Empty input hashes to the empty-string digest. */
export async function hashText(
  algorithm: HashAlgorithm,
  text: string,
  digester: Digester | null = platformDigester(),
): Promise<Digest> {
  if (!digester)
    return { ok: false, error: 'This platform does not offer crypto.subtle for hashing' };
  const bytes = utf8Bytes(text);
  if (!bytes.ok) return bytes;
  try {
    const buffer = await digester.digest(algorithm, bytes.bytes);
    return { ok: true, hex: bytesToHex(new Uint8Array(buffer)) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Hashing failed' };
  }
}
