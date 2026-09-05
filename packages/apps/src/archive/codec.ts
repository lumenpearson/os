/**
 * Compression, borrowed from the platform.
 *
 * ZIP's method 8 is a raw deflate stream — no zlib header, no checksum of its
 * own — which is exactly what `CompressionStream('deflate-raw')` produces and
 * `DecompressionStream('deflate-raw')` consumes. Every current browser and the
 * Tauri webview have both. Where they are missing there is no fallback worth
 * pretending about: writing falls back to storing the bytes uncompressed
 * (`pack.ts` decides that), and reading a deflated entry reports that this
 * build cannot do it rather than handing back wrong bytes.
 */

/** The globals this module needs, so a test can hand it a scope without them. */
export interface CodecScope {
  CompressionStream?: typeof CompressionStream;
  DecompressionStream?: typeof DecompressionStream;
}

export interface CodecSupport {
  deflate: boolean;
  inflate: boolean;
}

export class CodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodecError';
  }
}

/** What this platform can actually do. */
export function codecSupport(scope: CodecScope = globalThis): CodecSupport {
  return {
    deflate: typeof scope.CompressionStream === 'function',
    inflate: typeof scope.DecompressionStream === 'function',
  };
}

interface ByteTransform {
  readonly readable: ReadableStream<Uint8Array<ArrayBuffer>>;
  readonly writable: WritableStream<BufferSource>;
}

/** Push one buffer through a transform stream and collect everything it gives back. */
async function pump(transform: ByteTransform, data: Uint8Array): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  // The write cannot be awaited before reading: a transform holds back its
  // input until the output side is drained, so awaiting here would deadlock.
  const written = (async () => {
    // Every buffer here comes from the VFS or from `writeZip`, both of which
    // allocate plain ArrayBuffers; the DOM type excludes shared memory.
    await writer.write(data as BufferSource);
    await writer.close();
  })();
  written.catch(() => {
    // A failure on the write side surfaces on the read side below.
  });

  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.length;
  }
  await written;

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** Raw deflate, as ZIP method 8 stores it. */
export async function deflateRaw(
  data: Uint8Array,
  scope: CodecScope = globalThis,
): Promise<Uint8Array> {
  const Stream = scope.CompressionStream;
  if (typeof Stream !== 'function') {
    throw new CodecError('This build cannot compress: the platform has no CompressionStream.');
  }
  return pump(new Stream('deflate-raw'), data);
}

/** The inverse. Throws `CodecError` when the platform cannot, or when the stream is damaged. */
export async function inflateRaw(
  data: Uint8Array,
  scope: CodecScope = globalThis,
): Promise<Uint8Array> {
  const Stream = scope.DecompressionStream;
  if (typeof Stream !== 'function') {
    throw new CodecError(
      'This build cannot read deflated entries: the platform has no DecompressionStream.',
    );
  }
  try {
    return await pump(new Stream('deflate-raw'), data);
  } catch (error) {
    throw new CodecError(`Damaged compressed data: ${(error as Error).message}`);
  }
}
