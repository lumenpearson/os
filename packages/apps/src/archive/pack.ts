/**
 * The two operations that need a compressor: building an archive out of raw
 * bytes, and getting an entry's bytes back out of one.
 *
 * Both are async and both report progress, because an archive of a few
 * hundred megabytes must not freeze the window. Between entries the loop
 * hands the event loop back so the progress bar can actually paint.
 */

import { type CodecScope, codecSupport, deflateRaw, inflateRaw } from './codec';
import { crc32 } from './crc32';
import {
  METHOD_DEFLATE,
  METHOD_STORED,
  storedBytes,
  writeZip,
  type ZipEntry,
  ZipError,
  type ZipSource,
} from './zip';

/** Below this, deflate's own overhead usually costs more than it saves. */
const MIN_DEFLATE_BYTES = 64;

/** How often the loop yields, in entries. Small enough to keep 60fps, large enough not to crawl. */
const YIELD_EVERY = 16;

export interface PackSource {
  /** Name inside the archive, `/` separated. */
  name: string;
  isDirectory: boolean;
  /** The file's real bytes. Empty for a directory. */
  data: Uint8Array;
  modifiedAt: number;
}

export interface Progress {
  /** Entries finished so far. */
  done: number;
  total: number;
  /** The entry being worked on. */
  name: string;
}

export interface PackOptions {
  onProgress?: (progress: Progress) => void;
  /** Where the compression streams come from; tests pass a scope without them. */
  scope?: CodecScope;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Compress each file, then lay the archive out. An entry is deflated only
 * when deflating actually made it smaller; otherwise it is stored, which is
 * also what happens throughout on a platform with no compressor.
 */
export async function packArchive(
  sources: PackSource[],
  options: PackOptions = {},
): Promise<Uint8Array> {
  const scope = options.scope ?? globalThis;
  const canDeflate = codecSupport(scope).deflate;
  const prepared: ZipSource[] = [];

  for (const [index, source] of sources.entries()) {
    options.onProgress?.({ done: index, total: sources.length, name: source.name });
    if (index % YIELD_EVERY === 0) await tick();

    if (source.isDirectory) {
      prepared.push({ name: source.name, isDirectory: true, modifiedAt: source.modifiedAt });
      continue;
    }
    const raw = source.data;
    let data = raw;
    let method = METHOD_STORED;
    if (canDeflate && raw.length >= MIN_DEFLATE_BYTES) {
      const deflated = await deflateRaw(raw, scope);
      if (deflated.length < raw.length) {
        data = deflated;
        method = METHOD_DEFLATE;
      }
    }
    prepared.push({
      name: source.name,
      data,
      method,
      crc: crc32(raw),
      uncompressedSize: raw.length,
      modifiedAt: source.modifiedAt,
    });
  }

  options.onProgress?.({ done: sources.length, total: sources.length, name: '' });
  return writeZip(prepared);
}

/**
 * One entry's real bytes, checked against the size and checksum the archive
 * declares. A mismatch is reported rather than returned: silently handing
 * back damaged bytes is how a corrupt archive becomes a corrupt file on disk.
 */
export async function readEntryData(
  source: Uint8Array,
  entry: ZipEntry,
  options: { scope?: CodecScope } = {},
): Promise<Uint8Array> {
  if (entry.isDirectory) return new Uint8Array(0);
  if (entry.encrypted) {
    throw new ZipError(`"${entry.name}" is encrypted, and this app cannot decrypt entries.`);
  }
  const raw = storedBytes(source, entry);

  let data: Uint8Array;
  if (entry.method === METHOD_STORED) data = raw;
  else if (entry.method === METHOD_DEFLATE)
    data = await inflateRaw(raw, options.scope ?? globalThis);
  else {
    throw new ZipError(
      `"${entry.name}" uses compression method ${entry.method}, which this app cannot read.`,
    );
  }

  if (data.length !== entry.uncompressedSize) {
    throw new ZipError(
      `"${entry.name}" unpacked to ${data.length} bytes, not the ${entry.uncompressedSize} the archive declares.`,
    );
  }
  if (crc32(data) !== entry.crc) {
    throw new ZipError(`"${entry.name}" failed its checksum: the archive is damaged.`);
  }
  return data;
}
