/**
 * Base64, base64url, URL component, hex and HTML entities, encoding and
 * decoding, all going through UTF-8 bytes rather than through the platform's
 * `btoa`, which only speaks Latin-1.
 *
 * A JavaScript string is UTF-16 code units, not text, so it can hold half of a
 * surrogate pair — the wreckage of a `slice` through an emoji. `TextEncoder`
 * quietly turns that into U+FFFD, which is how a broken string becomes a
 * plausible-looking encoded blob that no longer round-trips. Everything here
 * refuses a lone surrogate and says where it is instead.
 */

export const CODECS = ['base64', 'base64url', 'url', 'hex', 'html'] as const;

export type Codec = (typeof CODECS)[number];

export const CODEC_LABEL: Record<Codec, string> = {
  base64: 'Base64',
  base64url: 'Base64 URL',
  url: 'URL component',
  hex: 'Hex',
  html: 'HTML entities',
};

export type Coded = { ok: true; value: string } | { ok: false; error: string };

/**
 * The buffer is pinned to a real `ArrayBuffer` rather than the generic
 * `ArrayBufferLike`, so bytes from here can be handed straight to Web Crypto.
 */
export type Bytes = { ok: true; bytes: Uint8Array<ArrayBuffer> } | { ok: false; error: string };

// ── UTF-8 ─────────────────────────────────────────────────────────────────

/** UTF-8 bytes, refusing an unpaired surrogate rather than replacing it. */
export function utf8Bytes(text: string): Bytes {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0xd800 || code > 0xdfff) continue;
    if (code > 0xdbff)
      return { ok: false, error: `Unpaired low surrogate at index ${i}: not valid text` };
    const next = text.charCodeAt(i + 1);
    if (Number.isNaN(next) || next < 0xdc00 || next > 0xdfff)
      return { ok: false, error: `Unpaired high surrogate at index ${i}: not valid text` };
    i += 1;
  }
  return { ok: true, bytes: new TextEncoder().encode(text) };
}

/** Text from UTF-8 bytes, refusing a byte sequence that is not UTF-8. */
export function utf8Text(bytes: Uint8Array): Coded {
  try {
    return { ok: true, value: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return { ok: false, error: 'Those bytes are not valid UTF-8' };
  }
}

// ── base64 ────────────────────────────────────────────────────────────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function bytesToBase64(bytes: Uint8Array, url = false): string {
  const alphabet = url ? B64URL : B64;
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] as number;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const pad = url ? '' : '=';
    out += alphabet.charAt(a >> 2);
    out += alphabet.charAt(((a & 0x03) << 4) | ((b ?? 0) >> 4));
    out += b === undefined ? pad : alphabet.charAt(((b & 0x0f) << 2) | ((c ?? 0) >> 6));
    out += c === undefined ? pad : alphabet.charAt(c & 0x3f);
  }
  return out;
}

export function base64ToBytes(text: string): Bytes {
  const compact = text.replace(/\s+/g, '');
  const body = compact.replace(/=+$/, '');
  if (compact.length !== body.length && compact.length % 4 !== 0)
    return { ok: false, error: 'Padding does not line up: the length must be a multiple of 4' };
  if (body.length % 4 === 1)
    return { ok: false, error: 'Truncated base64: one character is left over' };
  const bytes = new Uint8Array((body.length * 3) >> 2);
  let held = 0;
  let bits = 0;
  let at = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body.charAt(i);
    const value = ch === '-' ? 62 : ch === '_' ? 63 : B64.indexOf(ch);
    if (value === -1) return { ok: false, error: `'${ch}' is not a base64 character` };
    held = (held << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[at] = (held >> bits) & 0xff;
      at += 1;
    }
  }
  return { ok: true, bytes: bytes.subarray(0, at) };
}

// ── hex ───────────────────────────────────────────────────────────────────

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}

export function hexToBytes(text: string): Bytes {
  const compact = text.replace(/\s+/g, '').replace(/^0x/i, '');
  if (compact.length % 2 !== 0)
    return { ok: false, error: 'Hex needs an even number of digits: two per byte' };
  const bytes = new Uint8Array(compact.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    const pair = compact.slice(i * 2, i * 2 + 2);
    if (!/^[0-9a-fA-F]{2}$/.test(pair))
      return { ok: false, error: `'${pair}' is not a pair of hex digits` };
    bytes[i] = Number.parseInt(pair, 16);
  }
  return { ok: true, bytes };
}

// ── HTML entities ─────────────────────────────────────────────────────────

const NAMED: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * The five characters that change meaning in markup, plus everything outside
 * printable ASCII as a numeric reference — so the result is safe to paste into
 * a file of any encoding.
 */
export function encodeHtml(text: string): Coded {
  const checked = utf8Bytes(text);
  if (!checked.ok) return checked;
  let out = '';
  for (const ch of text) {
    switch (ch) {
      case '&':
        out += '&amp;';
        continue;
      case '<':
        out += '&lt;';
        continue;
      case '>':
        out += '&gt;';
        continue;
      case '"':
        out += '&quot;';
        continue;
      case "'":
        out += '&#x27;';
        continue;
      default:
        break;
    }
    const code = ch.codePointAt(0) as number;
    if (code >= 0x20 && code < 0x7f) out += ch;
    else if (ch === '\n' || ch === '\t' || ch === '\r') out += ch;
    else out += `&#x${code.toString(16)};`;
  }
  return { ok: true, value: out };
}

export function decodeHtml(text: string): Coded {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch !== '&') {
      out += ch;
      i += 1;
      continue;
    }
    const end = text.indexOf(';', i + 1);
    const body = end === -1 ? null : text.slice(i + 1, end);
    if (body === null || body === '' || /[\s&]/.test(body)) {
      out += ch;
      i += 1;
      continue;
    }
    if (body.startsWith('#')) {
      const hex = body.charAt(1) === 'x' || body.charAt(1) === 'X';
      const digits = hex ? body.slice(2) : body.slice(1);
      const valid = hex ? /^[0-9a-fA-F]+$/.test(digits) : /^[0-9]+$/.test(digits);
      if (!valid) return { ok: false, error: `'&${body};' is not a numeric reference` };
      const code = Number.parseInt(digits, hex ? 16 : 10);
      if (code > 0x10ffff) return { ok: false, error: `'&${body};' is beyond the last codepoint` };
      if (code >= 0xd800 && code <= 0xdfff)
        return {
          ok: false,
          error: `'&${body};' names half of a surrogate pair, which is not text`,
        };
      out += String.fromCodePoint(code);
      i = end + 1;
      continue;
    }
    const named = NAMED[body];
    if (named === undefined) return { ok: false, error: `'&${body};' is not an entity this knows` };
    out += named;
    i = end + 1;
  }
  return { ok: true, value: out };
}

// ── the two entry points ──────────────────────────────────────────────────

export function encodeText(codec: Codec, text: string): Coded {
  if (codec === 'html') return encodeHtml(text);
  const bytes = utf8Bytes(text);
  if (!bytes.ok) return bytes;
  switch (codec) {
    case 'base64':
      return { ok: true, value: bytesToBase64(bytes.bytes) };
    case 'base64url':
      return { ok: true, value: bytesToBase64(bytes.bytes, true) };
    case 'hex':
      return { ok: true, value: bytesToHex(bytes.bytes) };
    case 'url':
      return { ok: true, value: encodeURIComponent(text) };
  }
}

export function decodeText(codec: Codec, text: string): Coded {
  switch (codec) {
    case 'html':
      return decodeHtml(text);
    case 'url':
      try {
        return { ok: true, value: decodeURIComponent(text) };
      } catch {
        return { ok: false, error: 'A percent escape is incomplete or is not valid UTF-8' };
      }
    case 'base64':
    case 'base64url': {
      const bytes = base64ToBytes(text);
      return bytes.ok ? utf8Text(bytes.bytes) : bytes;
    }
    case 'hex': {
      const bytes = hexToBytes(text);
      return bytes.ok ? utf8Text(bytes.bytes) : bytes;
    }
  }
}
