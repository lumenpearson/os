import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  bytesToHex,
  type Codec,
  decodeHtml,
  decodeText,
  encodeHtml,
  encodeText,
  hexToBytes,
  utf8Bytes,
  utf8Text,
} from './encode';

/** An astral codepoint (U+1F680) and an accented BMP one, in one string. */
const ASTRAL = '\u{1f680} café';
const LONE_HIGH = 'a\ud83dz';
const LONE_LOW = 'a\ude80z';

const value = (result: { ok: boolean } & Record<string, unknown>): string => {
  if (!result.ok) throw new Error(`expected a value: ${String(result.error)}`);
  return result.value as string;
};

describe('utf8Bytes', () => {
  it('encodes an astral character as four bytes', () => {
    const result = utf8Bytes('\u{1f680}');
    expect(result.ok && [...result.bytes]).toEqual([0xf0, 0x9f, 0x9a, 0x80]);
  });

  it('rejects a lone high surrogate and says where it is', () => {
    expect(utf8Bytes(LONE_HIGH)).toEqual({
      ok: false,
      error: 'Unpaired high surrogate at index 1: not valid text',
    });
  });

  it('rejects a lone low surrogate', () => {
    expect(utf8Bytes(LONE_LOW)).toEqual({
      ok: false,
      error: 'Unpaired low surrogate at index 1: not valid text',
    });
  });

  it('rejects a high surrogate at the very end', () => {
    expect(utf8Bytes('ab\ud83d').ok).toBe(false);
  });

  it('accepts an empty string', () => {
    const result = utf8Bytes('');
    expect(result.ok && result.bytes.length).toBe(0);
  });
});

describe('utf8Text', () => {
  it('refuses bytes that are not UTF-8 rather than returning replacement characters', () => {
    expect(utf8Text(new Uint8Array([0xff, 0xfe]))).toEqual({
      ok: false,
      error: 'Those bytes are not valid UTF-8',
    });
  });

  it('decodes a truncated multi-byte sequence as an error', () => {
    expect(utf8Text(new Uint8Array([0xf0, 0x9f])).ok).toBe(false);
  });
});

describe('base64', () => {
  it('pads to a multiple of four', () => {
    expect(bytesToBase64(new Uint8Array([0x61]))).toBe('YQ==');
    expect(bytesToBase64(new Uint8Array([0x61, 0x62]))).toBe('YWI=');
    expect(bytesToBase64(new Uint8Array([0x61, 0x62, 0x63]))).toBe('YWJj');
  });

  it('drops the padding and swaps two characters for the URL alphabet', () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xbf]);
    expect(bytesToBase64(bytes)).toBe('+/+/');
    expect(bytesToBase64(bytes, true)).toBe('-_-_');
    expect(bytesToBase64(new Uint8Array([0x61]), true)).toBe('YQ');
  });

  it('reads both alphabets, padded or not', () => {
    const padded = base64ToBytes('YQ==');
    expect(padded.ok && [...padded.bytes]).toEqual([0x61]);
    const unpadded = base64ToBytes('YQ');
    expect(unpadded.ok && [...unpadded.bytes]).toEqual([0x61]);
    const url = base64ToBytes('-_-_');
    expect(url.ok && [...url.bytes]).toEqual([0xfb, 0xff, 0xbf]);
  });

  it('ignores whitespace inside the text', () => {
    const result = base64ToBytes('YW\nJj');
    expect(result.ok && [...result.bytes]).toEqual([0x61, 0x62, 0x63]);
  });

  it('names a character that is not base64', () => {
    expect(base64ToBytes('YQ*=')).toEqual({ ok: false, error: "'*' is not a base64 character" });
  });

  it('rejects a length that cannot be a base64 body', () => {
    expect(base64ToBytes('YWJjY')).toEqual({
      ok: false,
      error: 'Truncated base64: one character is left over',
    });
  });

  it('rejects padding that does not line up', () => {
    expect(base64ToBytes('YQ=').ok).toBe(false);
  });
});

describe('hex', () => {
  it('writes two lowercase digits a byte', () => {
    expect(bytesToHex(new Uint8Array([0x00, 0x0f, 0xff]))).toBe('000fff');
    expect(bytesToHex(new Uint8Array())).toBe('');
  });

  it('accepts an 0x prefix, whitespace and either case', () => {
    const result = hexToBytes('0x0F ff');
    expect(result.ok && [...result.bytes]).toEqual([0x0f, 0xff]);
  });

  it('rejects an odd number of digits', () => {
    expect(hexToBytes('abc')).toEqual({
      ok: false,
      error: 'Hex needs an even number of digits: two per byte',
    });
  });

  it('names a pair that is not hex', () => {
    expect(hexToBytes('abzz')).toEqual({
      ok: false,
      error: "'zz' is not a pair of hex digits",
    });
  });
});

describe('html entities', () => {
  it('escapes the five characters that change meaning in markup', () => {
    expect(value(encodeHtml('<a href="x">&\'</a>'))).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#x27;&lt;/a&gt;',
    );
  });

  it('writes a non-ASCII character as a numeric reference and reads it back', () => {
    const encoded = value(encodeHtml(ASTRAL));
    expect(encoded).toBe('&#x1f680; caf&#xe9;');
    expect(value(decodeHtml(encoded))).toBe(ASTRAL);
  });

  it('keeps tabs and newlines as themselves', () => {
    expect(value(encodeHtml('a\tb\nc'))).toBe('a\tb\nc');
  });

  it('reads decimal and hexadecimal references and the named ones', () => {
    expect(value(decodeHtml('&#128640;&#X1F680;&amp;&lt;&gt;&quot;&apos;'))).toBe(
      '\u{1f680}\u{1f680}&<>"\'',
    );
  });

  it('leaves a bare ampersand alone', () => {
    expect(value(decodeHtml('a & b &notanentity'))).toBe('a & b &notanentity');
  });

  it('rejects a reference to half a surrogate pair rather than mangling it', () => {
    expect(decodeHtml('&#xD83D;')).toEqual({
      ok: false,
      error: "'&#xD83D;' names half of a surrogate pair, which is not text",
    });
  });

  it('rejects a codepoint past the end of Unicode', () => {
    expect(decodeHtml('&#x110000;').ok).toBe(false);
  });

  it('rejects an entity it does not know', () => {
    expect(decodeHtml('&hearts;')).toEqual({
      ok: false,
      error: "'&hearts;' is not an entity this knows",
    });
  });

  it('rejects a numeric reference with a non-digit', () => {
    expect(decodeHtml('&#12x;').ok).toBe(false);
  });
});

describe('encodeText and decodeText', () => {
  const codecs: Codec[] = ['base64', 'base64url', 'url', 'hex', 'html'];

  it.each(codecs)('round-trips text through %s, astral characters included', (codec) => {
    const encoded = value(encodeText(codec, ASTRAL));
    expect(value(decodeText(codec, encoded))).toBe(ASTRAL);
  });

  it.each(codecs)('round-trips an empty string through %s', (codec) => {
    expect(value(decodeText(codec, value(encodeText(codec, ''))))).toBe('');
  });

  it.each(codecs)('refuses a lone surrogate through %s rather than mangling it', (codec) => {
    expect(encodeText(codec, LONE_HIGH).ok).toBe(false);
  });

  it('produces the known base64 of an astral character', () => {
    expect(value(encodeText('base64', '\u{1f680}'))).toBe('8J+agA==');
    expect(value(encodeText('base64url', '\u{1f680}'))).toBe('8J-agA');
    expect(value(encodeText('hex', '\u{1f680}'))).toBe('f09f9a80');
    expect(value(encodeText('url', '\u{1f680}'))).toBe('%F0%9F%9A%80');
  });

  it('reports a percent escape that is not valid UTF-8', () => {
    expect(decodeText('url', '%E0%A4%A')).toEqual({
      ok: false,
      error: 'A percent escape is incomplete or is not valid UTF-8',
    });
    expect(decodeText('url', '%FF').ok).toBe(false);
  });

  it('reports base64 that decodes to bytes which are not UTF-8', () => {
    expect(decodeText('base64', '//8=')).toEqual({
      ok: false,
      error: 'Those bytes are not valid UTF-8',
    });
  });
});
