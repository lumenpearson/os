/**
 * The ZIP container, read and written by hand over plain byte arrays.
 *
 * Reading starts at the end. A ZIP file is a run of local headers, each
 * followed by its compressed bytes, then a central directory that repeats the
 * same facts with an offset back to each local header, then a 22-byte
 * end-of-central-directory record. That last record ends with a comment of
 * variable length, so it is not at a fixed distance from the end of the file:
 * it has to be found by scanning backwards for its signature. The central
 * directory is then the authority on names, sizes and checksums — a local
 * header may legally leave the sizes at zero and put them in a data descriptor
 * after the data — while the local header is read only for the length of its
 * own name and extra field, which is what says where the bytes start.
 *
 * Writing is deliberately synchronous and takes bytes that are already in
 * their stored form, so the layout can be tested without a compressor in the
 * loop. `pack.ts` does the compression and calls in here.
 *
 * Not supported, and reported rather than guessed at: Zip64 (archives past
 * 4 GB or 65,535 entries) and encrypted entries.
 */

/** Anything this module refuses to read or write says so with one of these. */
export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

export const LOCAL_HEADER_SIGNATURE = 0x04034b50;
export const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
export const EOCD_SIGNATURE = 0x06054b50;

/** Fixed part of each structure, before the variable-length fields. */
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const EOCD_SIZE = 22;

/** The comment at the end of an archive is a 16-bit length. */
const MAX_COMMENT = 0xffff;

/** Any of these fields set to all ones means the real value lives in a Zip64 record. */
const ZIP64_MARKER = 0xffffffff;

export const METHOD_STORED = 0;
export const METHOD_DEFLATE = 8;

/** General-purpose bit flags this app reads. */
const FLAG_ENCRYPTED = 0x0001;
const FLAG_UTF8 = 0x0800;

/** MS-DOS external attribute bit for a directory. */
const DOS_DIRECTORY = 0x10;

export interface ZipEntry {
  /** The name exactly as the archive stores it, separators and all. */
  name: string;
  isDirectory: boolean;
  /** 0 stored, 8 deflate; anything else is reported, not decoded. */
  method: number;
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  /** Epoch milliseconds from the DOS date/time, or 0 when the archive left it unset. */
  modifiedAt: number;
  encrypted: boolean;
  comment: string;
  /** Byte offset of this entry's local header. */
  headerOffset: number;
  /** The stored bytes are `source.subarray(dataStart, dataEnd)`. */
  dataStart: number;
  dataEnd: number;
}

export interface ZipArchive {
  entries: ZipEntry[];
  comment: string;
  /** Length of the file the entries were read out of. */
  size: number;
}

const utf8Strict = new TextDecoder('utf-8', { fatal: true });
const utf8Lenient = new TextDecoder('utf-8');
const legacy = new TextDecoder('windows-1252');
const encoder = new TextEncoder();

/**
 * Names are UTF-8 when the archive says so with bit 11. Otherwise the spec
 * says code page 437, but in practice an archive written by anything modern
 * is UTF-8 whether or not it set the flag — so try that first and fall back
 * to a single-byte decoding, which at least never throws away bytes.
 */
function decodeText(bytes: Uint8Array, unicode: boolean): string {
  if (unicode) return utf8Lenient.decode(bytes);
  try {
    return utf8Strict.decode(bytes);
  } catch {
    return legacy.decode(bytes);
  }
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

/** Epoch milliseconds from an MS-DOS date and time pair; 0 when unset or nonsense. */
export function dosToEpoch(date: number, time: number): number {
  if (date === 0) return 0;
  const year = 1980 + ((date >> 9) & 0x7f);
  const month = (date >> 5) & 0x0f;
  const day = date & 0x1f;
  if (month < 1 || month > 12 || day < 1 || day > 31) return 0;
  const hour = (time >> 11) & 0x1f;
  const minute = (time >> 5) & 0x3f;
  const second = (time & 0x1f) * 2;
  if (hour > 23 || minute > 59) return 0;
  return new Date(year, month - 1, day, hour, minute, second, 0).getTime();
}

/**
 * An MS-DOS date and time pair. The format starts in 1980, runs out in 2107,
 * and keeps seconds in steps of two; anything outside that is clamped rather
 * than wrapped, so a file from 1970 does not claim to be from 2044.
 */
export function epochToDos(ms: number): { date: number; time: number } {
  const floor = { date: (1 << 5) | 1, time: 0 };
  if (!Number.isFinite(ms)) return floor;
  const d = new Date(ms);
  const year = d.getFullYear();
  if (Number.isNaN(year) || year < 1980) return floor;
  if (year > 2107) return { date: (127 << 9) | (12 << 5) | 31, time: (23 << 11) | (59 << 5) | 29 };
  return {
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
  };
}

/**
 * Offset of the end-of-central-directory record, or -1. Scanned backwards
 * from the end because the record's trailing comment is up to 64 KB long, so
 * no fixed offset finds it.
 */
export function findEndOfCentralDirectory(bytes: Uint8Array): number {
  if (bytes.length < EOCD_SIZE) return -1;
  const v = view(bytes);
  const earliest = Math.max(0, bytes.length - EOCD_SIZE - MAX_COMMENT);
  for (let at = bytes.length - EOCD_SIZE; at >= earliest; at -= 1) {
    if (v.getUint32(at, true) !== EOCD_SIGNATURE) continue;
    // The declared comment has to fit in what is left. Scanning backwards
    // means the last plausible record wins, which is the real one.
    if (at + EOCD_SIZE + v.getUint16(at + 20, true) <= bytes.length) return at;
  }
  return -1;
}

/** Where an entry's stored bytes begin, read from its own local header. */
function localDataStart(bytes: Uint8Array, v: DataView, entryName: string, at: number): number {
  if (at < 0 || at + LOCAL_HEADER_SIZE > bytes.length) {
    throw new ZipError(`Entry "${entryName}" points outside the file (offset ${at}).`);
  }
  if (v.getUint32(at, true) !== LOCAL_HEADER_SIGNATURE) {
    throw new ZipError(`Entry "${entryName}" has no local header at offset ${at}.`);
  }
  const nameLength = v.getUint16(at + 26, true);
  const extraLength = v.getUint16(at + 28, true);
  return at + LOCAL_HEADER_SIZE + nameLength + extraLength;
}

/** Parse an archive. Throws `ZipError` with a readable reason for anything malformed. */
export function readZip(bytes: Uint8Array): ZipArchive {
  if (bytes.length === 0) throw new ZipError('The file is empty.');
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd === -1) {
    throw new ZipError(
      'Not a ZIP archive: no end-of-central-directory record was found in the last 64 KB.',
    );
  }
  const v = view(bytes);
  const count = v.getUint16(eocd + 10, true);
  const directorySize = v.getUint32(eocd + 12, true);
  const directoryOffset = v.getUint32(eocd + 16, true);
  const commentLength = v.getUint16(eocd + 20, true);
  const comment = decodeText(
    bytes.subarray(eocd + EOCD_SIZE, eocd + EOCD_SIZE + commentLength),
    true,
  );

  if (count === 0xffff || directorySize === ZIP64_MARKER || directoryOffset === ZIP64_MARKER) {
    throw new ZipError('Zip64 archives are not supported.');
  }
  const directoryEnd = directoryOffset + directorySize;
  if (directoryEnd > bytes.length) {
    throw new ZipError('The central directory runs past the end of the file: truncated archive.');
  }

  const entries: ZipEntry[] = [];
  let at = directoryOffset;
  for (let i = 0; i < count; i += 1) {
    if (at + CENTRAL_HEADER_SIZE > directoryEnd) {
      throw new ZipError(
        `The central directory ends after ${i} of ${count} entries: truncated archive.`,
      );
    }
    if (v.getUint32(at, true) !== CENTRAL_HEADER_SIGNATURE) {
      throw new ZipError(`Damaged central directory: entry ${i + 1} has no header at ${at}.`);
    }
    const flags = v.getUint16(at + 8, true);
    const method = v.getUint16(at + 10, true);
    const time = v.getUint16(at + 12, true);
    const date = v.getUint16(at + 14, true);
    const crc = v.getUint32(at + 16, true);
    const compressedSize = v.getUint32(at + 20, true);
    const uncompressedSize = v.getUint32(at + 24, true);
    const nameLength = v.getUint16(at + 28, true);
    const extraLength = v.getUint16(at + 30, true);
    const entryCommentLength = v.getUint16(at + 32, true);
    const externalAttributes = v.getUint32(at + 38, true);
    const headerOffset = v.getUint32(at + 42, true);

    const nameAt = at + CENTRAL_HEADER_SIZE;
    const next = nameAt + nameLength + extraLength + entryCommentLength;
    if (next > directoryEnd) {
      throw new ZipError(`Damaged central directory: entry ${i + 1} names more than it holds.`);
    }
    if (
      compressedSize === ZIP64_MARKER ||
      uncompressedSize === ZIP64_MARKER ||
      headerOffset === ZIP64_MARKER
    ) {
      throw new ZipError('Zip64 archives are not supported.');
    }

    const unicode = (flags & FLAG_UTF8) !== 0;
    const name = decodeText(bytes.subarray(nameAt, nameAt + nameLength), unicode);
    const dataStart = localDataStart(bytes, v, name, headerOffset);
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.length) {
      throw new ZipError(`Entry "${name}" runs past the end of the file: truncated archive.`);
    }

    entries.push({
      name,
      isDirectory:
        name.endsWith('/') ||
        (uncompressedSize === 0 && (externalAttributes & DOS_DIRECTORY) !== 0),
      method,
      crc,
      compressedSize,
      uncompressedSize,
      modifiedAt: dosToEpoch(date, time),
      encrypted: (flags & FLAG_ENCRYPTED) !== 0,
      comment: decodeText(bytes.subarray(nameAt + nameLength + extraLength, next), unicode),
      headerOffset,
      dataStart,
      dataEnd,
    });
    at = next;
  }

  return { entries, comment, size: bytes.length };
}

/** The stored (still compressed, for method 8) bytes of one entry. */
export function storedBytes(source: Uint8Array, entry: ZipEntry): Uint8Array {
  if (entry.dataEnd > source.length) {
    throw new ZipError(`Entry "${entry.name}" runs past the end of the file.`);
  }
  return source.subarray(entry.dataStart, entry.dataEnd);
}

export interface ZipSource {
  /** Path inside the archive, `/` separated. A directory gets a trailing `/`. */
  name: string;
  isDirectory?: boolean;
  /** Bytes exactly as they are to be stored: already deflated for method 8. */
  data?: Uint8Array;
  method?: number;
  /** Checksum of the *uncompressed* bytes. */
  crc?: number;
  uncompressedSize?: number;
  modifiedAt?: number;
  comment?: string;
}

/**
 * Lay out an archive over sources whose bytes are already in stored form.
 * Names are written as UTF-8 with the flag that says so.
 */
export function writeZip(sources: ZipSource[], archiveComment = ''): Uint8Array {
  const prepared = sources.map((source) => {
    const isDirectory = source.isDirectory ?? source.name.endsWith('/');
    const method = source.method ?? METHOD_STORED;
    if (method !== METHOD_STORED && method !== METHOD_DEFLATE) {
      throw new ZipError(`Cannot write compression method ${method}.`);
    }
    const data = isDirectory ? new Uint8Array(0) : (source.data ?? new Uint8Array(0));
    if (isDirectory && (source.data?.length ?? 0) > 0) {
      throw new ZipError(`Directory entry "${source.name}" cannot carry data.`);
    }
    const name = isDirectory && !source.name.endsWith('/') ? `${source.name}/` : source.name;
    if (name === '' || name === '/') throw new ZipError('An entry cannot have an empty name.');
    const nameBytes = encoder.encode(name);
    if (nameBytes.length > MAX_COMMENT) {
      throw new ZipError(`Entry name is too long: "${name}".`);
    }
    return {
      nameBytes,
      commentBytes: encoder.encode(source.comment ?? ''),
      data,
      isDirectory,
      method: isDirectory ? METHOD_STORED : method,
      crc: isDirectory ? 0 : (source.crc ?? 0),
      uncompressedSize: isDirectory ? 0 : (source.uncompressedSize ?? data.length),
      dos: epochToDos(source.modifiedAt ?? Date.now()),
    };
  });

  if (prepared.length > MAX_COMMENT) {
    throw new ZipError('An archive cannot hold more than 65,535 entries without Zip64.');
  }
  const commentBytes = encoder.encode(archiveComment);
  const localSize = prepared.reduce(
    (sum, e) => sum + LOCAL_HEADER_SIZE + e.nameBytes.length + e.data.length,
    0,
  );
  const centralSize = prepared.reduce(
    (sum, e) => sum + CENTRAL_HEADER_SIZE + e.nameBytes.length + e.commentBytes.length,
    0,
  );
  const total = localSize + centralSize + EOCD_SIZE + commentBytes.length;
  if (total > ZIP64_MARKER) {
    throw new ZipError('An archive cannot exceed 4 GB without Zip64.');
  }
  const out = new Uint8Array(total);
  const v = view(out);

  const offsets: number[] = [];
  let at = 0;
  for (const e of prepared) {
    offsets.push(at);
    v.setUint32(at, LOCAL_HEADER_SIGNATURE, true);
    v.setUint16(at + 4, e.method === METHOD_DEFLATE ? 20 : 10, true);
    v.setUint16(at + 6, FLAG_UTF8, true);
    v.setUint16(at + 8, e.method, true);
    v.setUint16(at + 10, e.dos.time, true);
    v.setUint16(at + 12, e.dos.date, true);
    v.setUint32(at + 14, e.crc, true);
    v.setUint32(at + 18, e.data.length, true);
    v.setUint32(at + 22, e.uncompressedSize, true);
    v.setUint16(at + 26, e.nameBytes.length, true);
    v.setUint16(at + 28, 0, true);
    out.set(e.nameBytes, at + LOCAL_HEADER_SIZE);
    out.set(e.data, at + LOCAL_HEADER_SIZE + e.nameBytes.length);
    at += LOCAL_HEADER_SIZE + e.nameBytes.length + e.data.length;
  }

  const directoryOffset = at;
  for (const [index, e] of prepared.entries()) {
    v.setUint32(at, CENTRAL_HEADER_SIGNATURE, true);
    v.setUint16(at + 4, 20, true);
    v.setUint16(at + 6, e.method === METHOD_DEFLATE ? 20 : 10, true);
    v.setUint16(at + 8, FLAG_UTF8, true);
    v.setUint16(at + 10, e.method, true);
    v.setUint16(at + 12, e.dos.time, true);
    v.setUint16(at + 14, e.dos.date, true);
    v.setUint32(at + 16, e.crc, true);
    v.setUint32(at + 20, e.data.length, true);
    v.setUint32(at + 24, e.uncompressedSize, true);
    v.setUint16(at + 28, e.nameBytes.length, true);
    v.setUint16(at + 30, 0, true);
    v.setUint16(at + 32, e.commentBytes.length, true);
    v.setUint16(at + 34, 0, true);
    v.setUint16(at + 36, 0, true);
    v.setUint32(at + 38, e.isDirectory ? DOS_DIRECTORY : 0, true);
    v.setUint32(at + 42, offsets[index] ?? 0, true);
    out.set(e.nameBytes, at + CENTRAL_HEADER_SIZE);
    out.set(e.commentBytes, at + CENTRAL_HEADER_SIZE + e.nameBytes.length);
    at += CENTRAL_HEADER_SIZE + e.nameBytes.length + e.commentBytes.length;
  }

  v.setUint32(at, EOCD_SIGNATURE, true);
  v.setUint16(at + 4, 0, true);
  v.setUint16(at + 6, 0, true);
  v.setUint16(at + 8, prepared.length, true);
  v.setUint16(at + 10, prepared.length, true);
  v.setUint32(at + 12, at - directoryOffset, true);
  v.setUint32(at + 16, directoryOffset, true);
  v.setUint16(at + 20, commentBytes.length, true);
  out.set(commentBytes, at + EOCD_SIZE);
  return out;
}
