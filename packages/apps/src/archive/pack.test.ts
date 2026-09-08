import { describe, expect, it } from 'vitest';
import { CodecError } from './codec';
import { crc32 } from './crc32';
import { FIXTURE_LONG_TEXT, fixtureArchive } from './fixture';
import { type PackSource, type Progress, packArchive, readEntryData } from './pack';
import {
  findEndOfCentralDirectory,
  METHOD_DEFLATE,
  METHOD_STORED,
  readZip,
  type ZipEntry,
  ZipError,
} from './zip';

const bytes = (value: string) => new TextEncoder().encode(value);
const text = (data: Uint8Array) => new TextDecoder().decode(data);

const file = (name: string, body: string): PackSource => ({
  name,
  isDirectory: false,
  data: bytes(body),
  modifiedAt: new Date(2024, 4, 17, 9, 30, 0).getTime(),
});

const folder = (name: string): PackSource => ({
  name,
  isDirectory: true,
  data: new Uint8Array(0),
  modifiedAt: new Date(2024, 4, 17, 9, 30, 0).getTime(),
});

const compressible = 'the quick brown fox jumps over the lazy dog\n'.repeat(20);

describe('packArchive', () => {
  it('builds an archive whose entries read back byte for byte', async () => {
    const sources = [file('a.txt', 'hello'), folder('docs'), file('docs/b.txt', compressible)];
    const zip = await packArchive(sources);
    const archive = readZip(zip);

    expect(archive.entries.map((e) => e.name)).toEqual(['a.txt', 'docs/', 'docs/b.txt']);
    expect(text(await readEntryData(zip, archive.entries[0] as ZipEntry))).toBe('hello');
    expect(text(await readEntryData(zip, archive.entries[2] as ZipEntry))).toBe(compressible);
    expect(archive.entries[1]?.isDirectory).toBe(true);
  });

  it('deflates what deflating helps and stores what it does not', async () => {
    const zip = await packArchive([file('short.txt', 'hi'), file('long.txt', compressible)]);
    const archive = readZip(zip);
    expect(archive.entries[0]?.method).toBe(METHOD_STORED);
    expect(archive.entries[1]?.method).toBe(METHOD_DEFLATE);
    expect(archive.entries[1]?.compressedSize).toBeLessThan(
      archive.entries[1]?.uncompressedSize ?? 0,
    );
  });

  it('records the checksum of the real bytes, not of the compressed ones', async () => {
    const zip = await packArchive([file('long.txt', compressible)]);
    expect(readZip(zip).entries[0]?.crc).toBe(crc32(bytes(compressible)));
  });

  it('stores everything, and still round-trips, where the platform cannot compress', async () => {
    const zip = await packArchive([file('long.txt', compressible)], { scope: {} });
    const archive = readZip(zip);
    expect(archive.entries[0]?.method).toBe(METHOD_STORED);
    expect(archive.entries[0]?.compressedSize).toBe(compressible.length);
    expect(text(await readEntryData(zip, archive.entries[0] as ZipEntry))).toBe(compressible);
  });

  it('reports progress once per entry and finishes at the total', async () => {
    const seen: Progress[] = [];
    const sources = [file('a', 'a'), file('b', 'b'), file('c', 'c')];
    await packArchive(sources, { onProgress: (p) => seen.push(p) });
    expect(seen.map((p) => p.name)).toEqual(['a', 'b', 'c', '']);
    expect(seen.map((p) => p.done)).toEqual([0, 1, 2, 3]);
    expect(seen.every((p) => p.total === 3)).toBe(true);
  });

  it('writes an empty archive for no sources', async () => {
    const zip = await packArchive([]);
    expect(readZip(zip).entries).toEqual([]);
    expect(findEndOfCentralDirectory(zip)).toBe(0);
  });

  it('keeps the modification time it was given', async () => {
    const when = new Date(2019, 10, 3, 14, 22, 30).getTime();
    const zip = await packArchive([{ ...file('a.txt', 'x'), modifiedAt: when }]);
    expect(readZip(zip).entries[0]?.modifiedAt).toBe(when);
  });
});

describe('readEntryData', () => {
  it('reads a stored entry another tool wrote', async () => {
    const zip = fixtureArchive();
    const entry = readZip(zip).entries[0];
    expect(text(await readEntryData(zip, entry as ZipEntry))).toBe('hello\n');
  });

  it('inflates a deflated entry another tool wrote', async () => {
    const zip = fixtureArchive();
    const entry = readZip(zip).entries[1];
    expect(text(await readEntryData(zip, entry as ZipEntry))).toBe(FIXTURE_LONG_TEXT);
  });

  it('returns nothing for a directory entry', async () => {
    const zip = fixtureArchive();
    const entry = readZip(zip).entries[2];
    expect(await readEntryData(zip, entry as ZipEntry)).toEqual(new Uint8Array(0));
  });

  it('refuses an entry whose checksum does not match its bytes', async () => {
    const zip = await packArchive([file('a.txt', 'hello')]);
    const entry = { ...(readZip(zip).entries[0] as ZipEntry), crc: 12345 };
    await expect(readEntryData(zip, entry)).rejects.toThrow(/failed its checksum/);
  });

  it('refuses an entry whose size does not match its bytes', async () => {
    const zip = await packArchive([file('a.txt', 'hello')]);
    const entry = { ...(readZip(zip).entries[0] as ZipEntry), uncompressedSize: 99 };
    await expect(readEntryData(zip, entry)).rejects.toThrow(/not the 99 the archive declares/);
  });

  it('names the compression method it cannot read', async () => {
    const zip = await packArchive([file('a.txt', 'hello')]);
    const entry = { ...(readZip(zip).entries[0] as ZipEntry), method: 14 };
    await expect(readEntryData(zip, entry)).rejects.toBeInstanceOf(ZipError);
    await expect(readEntryData(zip, entry)).rejects.toThrow(/method 14/);
  });

  it('refuses an encrypted entry rather than returning its ciphertext', async () => {
    const zip = await packArchive([file('a.txt', 'hello')]);
    const entry = { ...(readZip(zip).entries[0] as ZipEntry), encrypted: true };
    await expect(readEntryData(zip, entry)).rejects.toThrow(/encrypted/);
  });

  it('says so honestly when the platform cannot inflate', async () => {
    const zip = fixtureArchive();
    const entry = readZip(zip).entries[1];
    await expect(readEntryData(zip, entry as ZipEntry, { scope: {} })).rejects.toBeInstanceOf(
      CodecError,
    );
    await expect(readEntryData(zip, entry as ZipEntry, { scope: {} })).rejects.toThrow(
      /no DecompressionStream/,
    );
  });

  it('reports damaged compressed data', async () => {
    const zip = fixtureArchive();
    const entry = readZip(zip).entries[1];
    const damaged = zip.slice();
    const at = (entry?.dataStart ?? 0) + 4;
    damaged[at] = (damaged[at] ?? 0) ^ 0xff;
    await expect(readEntryData(damaged, entry as ZipEntry)).rejects.toThrow(
      /Damaged compressed data|failed its checksum|not the 1760/,
    );
  });
});
