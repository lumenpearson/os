import { describe, expect, it } from 'vitest';
import { crc32 } from './crc32';
import { FIXTURE_COMMENT, FIXTURE_MODIFIED, fixtureArchive } from './fixture';
import {
  dosToEpoch,
  EOCD_SIGNATURE,
  epochToDos,
  findEndOfCentralDirectory,
  METHOD_DEFLATE,
  METHOD_STORED,
  readZip,
  storedBytes,
  writeZip,
  ZipError,
  type ZipSource,
} from './zip';

const bytes = (value: string) => new TextEncoder().encode(value);
const text = (data: Uint8Array) => new TextDecoder().decode(data);
const at = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);

const stored = (name: string, body: string, modifiedAt?: number): ZipSource => {
  const data = bytes(body);
  return {
    name,
    data,
    method: METHOD_STORED,
    crc: crc32(data),
    uncompressedSize: data.length,
    modifiedAt: modifiedAt ?? new Date(2024, 4, 17, 9, 30, 0).getTime(),
  };
};

describe('epochToDos and dosToEpoch', () => {
  it('round-trips an instant at the two-second resolution of the fields', () => {
    const when = new Date(2024, 4, 17, 9, 30, 44).getTime();
    const dos = epochToDos(when);
    expect(dosToEpoch(dos.date, dos.time)).toBe(when);
  });

  it('rounds an odd second down, because the field counts seconds in twos', () => {
    const odd = new Date(2001, 0, 2, 3, 4, 5).getTime();
    const dos = epochToDos(odd);
    expect(dosToEpoch(dos.date, dos.time)).toBe(new Date(2001, 0, 2, 3, 4, 4).getTime());
  });

  it('clamps anything before 1980 to the start of the format', () => {
    const dos = epochToDos(0);
    expect(dosToEpoch(dos.date, dos.time)).toBe(new Date(1980, 0, 1, 0, 0, 0).getTime());
    expect(epochToDos(Number.NaN)).toEqual(dos);
  });

  it('clamps past 2107 instead of wrapping back into the past', () => {
    const late = epochToDos(new Date(2200, 0, 1).getTime());
    expect(dosToEpoch(late.date, late.time)).toBe(new Date(2107, 11, 31, 23, 59, 58).getTime());
  });

  it('reads an unset date as unknown rather than as 1980', () => {
    expect(dosToEpoch(0, 0)).toBe(0);
  });

  it('rejects an impossible month, day or hour', () => {
    expect(dosToEpoch((44 << 9) | (13 << 5) | 1, 0)).toBe(0);
    expect(dosToEpoch((44 << 9) | (1 << 5) | 0, 0)).toBe(0);
    expect(dosToEpoch((44 << 9) | (1 << 5) | 1, 31 << 11)).toBe(0);
  });

  it('puts each field where the format says it goes', () => {
    const dos = epochToDos(new Date(1981, 1, 3, 4, 5, 6).getTime());
    expect((dos.date >> 9) & 0x7f).toBe(1);
    expect((dos.date >> 5) & 0x0f).toBe(2);
    expect(dos.date & 0x1f).toBe(3);
    expect((dos.time >> 11) & 0x1f).toBe(4);
    expect((dos.time >> 5) & 0x3f).toBe(5);
    expect((dos.time & 0x1f) * 2).toBe(6);
  });
});

describe('findEndOfCentralDirectory', () => {
  it('finds the record at the end of a plain archive', () => {
    const zip = writeZip([stored('a.txt', 'hello')]);
    const offset = findEndOfCentralDirectory(zip);
    expect(offset).toBe(zip.length - 22);
    expect(at(zip).getUint32(offset, true)).toBe(EOCD_SIGNATURE);
  });

  it('finds it behind a long comment, where a fixed offset would miss', () => {
    const comment = 'c'.repeat(400);
    const zip = writeZip([stored('a.txt', 'hello')], comment);
    expect(findEndOfCentralDirectory(zip)).toBe(zip.length - 22 - comment.length);
    expect(readZip(zip).comment).toBe(comment);
  });

  it('is not fooled by the signature appearing inside an entry', () => {
    const trap = new Uint8Array(34);
    trap.set([0x50, 0x4b, 0x05, 0x06]);
    const zip = writeZip([
      { name: 'trap.bin', data: trap, crc: crc32(trap), uncompressedSize: trap.length },
    ]);
    expect(findEndOfCentralDirectory(zip)).toBe(zip.length - 22);
    expect(readZip(zip).entries).toHaveLength(1);
  });

  it('reports -1 for a buffer too short to hold the record', () => {
    expect(findEndOfCentralDirectory(new Uint8Array(0))).toBe(-1);
    expect(findEndOfCentralDirectory(new Uint8Array(21))).toBe(-1);
  });
});

describe('writeZip then readZip', () => {
  it('returns the entries that went in', () => {
    const when = new Date(2023, 6, 4, 12, 0, 0).getTime();
    const zip = writeZip([
      stored('notes.txt', 'hello world', when),
      stored('src/a.ts', 'export {}', when),
    ]);
    const archive = readZip(zip);

    expect(archive.entries.map((e) => e.name)).toEqual(['notes.txt', 'src/a.ts']);
    expect(archive.size).toBe(zip.length);
    const first = archive.entries[0];
    expect(first?.method).toBe(METHOD_STORED);
    expect(first?.uncompressedSize).toBe(11);
    expect(first?.compressedSize).toBe(11);
    expect(first?.crc).toBe(crc32(bytes('hello world')));
    expect(first?.modifiedAt).toBe(when);
    expect(first?.isDirectory).toBe(false);
    expect(first?.encrypted).toBe(false);
  });

  it('puts the bytes of each entry where its header says they are', () => {
    const zip = writeZip([stored('a.txt', 'aaa'), stored('b.txt', 'bbbb'), stored('c.txt', '')]);
    const archive = readZip(zip);
    expect(archive.entries.map((e) => text(storedBytes(zip, e)))).toEqual(['aaa', 'bbbb', '']);
  });

  it('round-trips a directory entry as a directory', () => {
    const zip = writeZip([{ name: 'docs', isDirectory: true }, stored('docs/a.txt', 'x')]);
    const archive = readZip(zip);
    expect(archive.entries[0]?.name).toBe('docs/');
    expect(archive.entries[0]?.isDirectory).toBe(true);
    expect(archive.entries[0]?.uncompressedSize).toBe(0);
    expect(archive.entries[1]?.isDirectory).toBe(false);
  });

  it('round-trips a non-ASCII name through UTF-8', () => {
    const zip = writeZip([stored('résumé/naïve — draft.txt', 'x')]);
    expect(readZip(zip).entries[0]?.name).toBe('résumé/naïve — draft.txt');
  });

  it('keeps the two sizes of a deflated entry apart', () => {
    const packed = new Uint8Array([1, 2, 3, 4]);
    const zip = writeZip([
      {
        name: 'big.txt',
        data: packed,
        method: METHOD_DEFLATE,
        crc: 0x12345678,
        uncompressedSize: 4096,
      },
    ]);
    const entry = readZip(zip).entries[0];
    expect(entry?.method).toBe(METHOD_DEFLATE);
    expect(entry?.compressedSize).toBe(4);
    expect(entry?.uncompressedSize).toBe(4096);
    expect(entry?.crc).toBe(0x12345678);
    expect(entry && storedBytes(zip, entry)).toEqual(packed);
  });

  it('carries an entry comment and an archive comment', () => {
    const zip = writeZip([{ ...stored('a.txt', 'x'), comment: 'per entry' }], 'whole archive');
    const archive = readZip(zip);
    expect(archive.entries[0]?.comment).toBe('per entry');
    expect(archive.comment).toBe('whole archive');
  });

  it('writes an empty archive that reads back as empty', () => {
    const zip = writeZip([]);
    expect(zip).toHaveLength(22);
    expect(readZip(zip).entries).toEqual([]);
  });

  it('holds up over a hundred entries, offsets and all', () => {
    const sources = Array.from({ length: 120 }, (_, i) => stored(`f${i}.txt`, `body ${i}`));
    const archive = readZip(writeZip(sources));
    expect(archive.entries).toHaveLength(120);
    expect(archive.entries.map((e) => text(storedBytes(writeZip(sources), e)))).toEqual(
      sources.map((_, i) => `body ${i}`),
    );
  });

  it('refuses to write what it cannot describe', () => {
    expect(() => writeZip([{ name: 'x', method: 12 }])).toThrow(ZipError);
    expect(() => writeZip([{ name: '' }])).toThrow(/empty name/);
    expect(() => writeZip([{ name: 'd', isDirectory: true, data: bytes('x') }])).toThrow(
      /cannot carry data/,
    );
  });
});

describe('readZip on damaged input', () => {
  const good = () => writeZip([stored('a.txt', 'hello'), stored('b.txt', 'goodbye')]);

  it('rejects an empty file by name', () => {
    expect(() => readZip(new Uint8Array(0))).toThrow(/empty/i);
  });

  it('rejects a file with no end-of-central-directory record', () => {
    const notAnArchive = bytes('this is a text file, not an archive at all');
    expect(() => readZip(notAnArchive)).toThrow(ZipError);
    expect(() => readZip(notAnArchive)).toThrow(/no end-of-central-directory record/);
  });

  it('rejects an archive whose end record was cut off', () => {
    const zip = good();
    expect(() => readZip(zip.subarray(0, zip.length - 10))).toThrow(
      /no end-of-central-directory record/,
    );
  });

  it('rejects an archive whose central directory is not there', () => {
    const zip = good();
    at(zip).setUint32(findEndOfCentralDirectory(zip) + 16, zip.length - 4, true);
    expect(() => readZip(zip)).toThrow(/truncated archive/);
  });

  it('rejects a central directory entry with a broken signature', () => {
    const zip = good();
    const view = at(zip);
    const directory = view.getUint32(findEndOfCentralDirectory(zip) + 16, true);
    view.setUint32(directory, 0xdeadbeef, true);
    expect(() => readZip(zip)).toThrow(/Damaged central directory/);
  });

  it('rejects an entry whose local header offset points at nothing', () => {
    const zip = good();
    const view = at(zip);
    const directory = view.getUint32(findEndOfCentralDirectory(zip) + 16, true);
    view.setUint32(directory + 42, 9, true);
    expect(() => readZip(zip)).toThrow(/no local header/);
  });

  it('rejects an entry whose data runs past the end of the file', () => {
    const zip = good();
    const view = at(zip);
    const directory = view.getUint32(findEndOfCentralDirectory(zip) + 16, true);
    view.setUint32(directory + 20, 100_000, true);
    expect(() => readZip(zip)).toThrow(/runs past the end of the file/);
  });

  it('says plainly when an archive needs Zip64', () => {
    const zip = good();
    at(zip).setUint32(findEndOfCentralDirectory(zip) + 16, 0xffffffff, true);
    expect(() => readZip(zip)).toThrow(/Zip64/);
  });

  it('reports every truncation as a ZipError, never a raw range error', () => {
    const zip = good();
    for (let cut = 1; cut < zip.length; cut += 1) {
      try {
        readZip(zip.subarray(0, cut));
      } catch (error) {
        expect(error, `cut at ${cut}`).toBeInstanceOf(ZipError);
      }
    }
  });
});

describe('reading an archive written by another tool', () => {
  const zip = fixtureArchive();

  it('lists every entry in central directory order', () => {
    expect(readZip(zip).entries.map((e) => e.name)).toEqual([
      'hello.txt',
      'long.txt',
      'docs/',
      'docs/note.txt',
    ]);
  });

  it('reads the stored entry and its bytes', () => {
    const entry = readZip(zip).entries[0];
    expect(entry?.method).toBe(METHOD_STORED);
    expect(entry?.uncompressedSize).toBe(6);
    expect(entry?.crc).toBe(crc32(bytes('hello\n')));
    expect(entry?.modifiedAt).toBe(FIXTURE_MODIFIED);
    expect(entry && text(storedBytes(zip, entry))).toBe('hello\n');
  });

  it('reports the deflated entry without decompressing it', () => {
    const entry = readZip(zip).entries[1];
    expect(entry?.method).toBe(METHOD_DEFLATE);
    expect(entry?.uncompressedSize).toBe(1760);
    expect(entry?.compressedSize).toBe(61);
    expect(entry && storedBytes(zip, entry)).toHaveLength(61);
  });

  it('recognises the directory entry that tool wrote', () => {
    expect(readZip(zip).entries[2]?.isDirectory).toBe(true);
    expect(readZip(zip).entries[3]?.isDirectory).toBe(false);
  });

  it('skips the extra fields this writer never emits', () => {
    const entry = readZip(zip).entries[0];
    const withoutExtra = (entry?.headerOffset ?? 0) + 30 + 'hello.txt'.length;
    expect(entry?.dataStart).toBeGreaterThan(withoutExtra);
  });

  it('reads the archive comment at the end', () => {
    expect(readZip(zip).comment).toBe(FIXTURE_COMMENT);
  });
});
