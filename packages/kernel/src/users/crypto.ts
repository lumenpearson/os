/**
 * Password hashing with PBKDF2-SHA256 through Web Crypto. Local-only: the
 * threat model is a shared machine, not a server breach, so 150k iterations
 * keeps unlock under ~100 ms on a laptop while making brute force tedious.
 */

const ITERATIONS = 150_000;
const KEY_BITS = 256;

export function randomSalt(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return toHex(arr);
}

export async function hashSecret(secret: string, saltHex: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret.normalize('NFKC')),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: ITERATIONS },
    key,
    KEY_BITS,
  );
  return toHex(new Uint8Array(bits));
}

export async function verifySecret(
  secret: string,
  saltHex: string,
  expectedHex: string,
): Promise<boolean> {
  const actual = await hashSecret(secret, saltHex);
  return constantTimeEqual(actual, expectedHex);
}

/** 6 groups of 4 from an unambiguous alphabet: "K7QX-3M9P-…". */
export function generateRecoveryKey(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]);
  const groups: string[] = [];
  for (let i = 0; i < 24; i += 4) groups.push(chars.slice(i, i + 4).join(''));
  return groups.join('-');
}

/** Accepts the key with or without dashes, any case, stray spaces. */
export function normalizeRecoveryKey(input: string): string {
  const clean = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const groups: string[] = [];
  for (let i = 0; i < clean.length; i += 4) groups.push(clean.slice(i, i + 4));
  return groups.join('-');
}

export function isRecoveryKeyShape(input: string): boolean {
  return /^([A-Z0-9]{4}-){5}[A-Z0-9]{4}$/.test(normalizeRecoveryKey(input));
}

export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const;
  const s = Math.min(4, password.length < 4 ? 0 : score) as 0 | 1 | 2 | 3 | 4;
  return { score: s, label: labels[s] };
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
