import { describe, expect, it } from 'vitest';
import { sha256Hex } from './digest';
import {
  bannerUrl,
  catalogueUrl,
  type FetchProgress,
  fetchBanner,
  fetchCatalogue,
  fetchPackage,
  fetchPayload,
  joinUrl,
  MAX_DOCUMENT_BYTES,
  packageUrl,
  payloadUrl,
  type StoreError,
  type StoreResult,
} from './fetch';
import {
  appPayloadJson,
  bannerJson,
  catalogueJson,
  fontPayloadJson,
  POMODORO,
  packageJson,
  STORE_BASE,
} from './fixture';
import { isUnsupportedFormat } from './parse';
import type { PayloadPackage } from './types';

const encoder = new TextEncoder();

interface ResponseStub {
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  /** Chunks the body hands out, or null for a response whose body cannot be read in pieces. */
  chunks?: Uint8Array[] | null;
  bytes?: Uint8Array;
  onCancel?: () => void;
}

/**
 * A response with only the parts `fetch.ts` touches: ok, the status, one
 * header, and either a body that reads in chunks or none at all. A real
 * Response cannot be built the same way in every environment this runs in.
 */
function response(stub: ResponseStub): Response {
  const status = stub.status ?? 200;
  const bytes = stub.bytes ?? new Uint8Array(0);
  const headers = new Map(
    Object.entries(stub.headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]),
  );
  const chunks = stub.chunks === undefined ? [bytes] : stub.chunks;
  const body =
    chunks === null
      ? null
      : {
          getReader: () => {
            let index = 0;
            return {
              read: async () => {
                const chunk = chunks[index];
                index += 1;
                return chunk === undefined
                  ? { done: true, value: undefined }
                  : { done: false, value: chunk };
              },
              cancel: async () => stub.onCancel?.(),
            };
          },
        };
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: stub.statusText ?? '',
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    body,
    arrayBuffer: async () => bytes.slice().buffer,
  } as unknown as Response;
}

function textResponse(text: string, stub: Omit<ResponseStub, 'bytes'> = {}): Response {
  const bytes = encoder.encode(text);
  return response({ ...stub, bytes, chunks: stub.chunks === null ? null : [bytes] });
}

interface Call {
  url: string;
  init: RequestInit | undefined;
}

function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    return handler(url);
  };
  return { calls, fetch: fetch as unknown as typeof globalThis.fetch };
}

function error<T>(result: StoreResult<T>): StoreError {
  if (result.ok) throw new Error('expected the fetch to fail');
  return result.error;
}

function value<T>(result: StoreResult<T>): T {
  if (!result.ok) throw new Error(`expected a value: ${result.error.message}`);
  return result.value;
}

function chunked(text: string, size: number): { bytes: Uint8Array; chunks: Uint8Array[] } {
  const bytes = encoder.encode(text);
  const chunks: Uint8Array[] = [];
  for (let at = 0; at < bytes.byteLength; at += size) chunks.push(bytes.subarray(at, at + size));
  return { bytes, chunks };
}

async function payloadFor(text: string, patch: Partial<PayloadPackage> = {}) {
  const bytes = encoder.encode(text);
  const digest = await sha256Hex(bytes);
  if (!digest.ok) throw new Error(digest.message);
  const pkg: PayloadPackage = {
    id: POMODORO,
    kind: 'app',
    name: 'Pomodoro',
    tagline: 'A timer that keeps the hour honest.',
    version: '1.2.0',
    publisher: 'Lumen',
    category: 'utilities',
    size: bytes.byteLength,
    price: 'free',
    keywords: [],
    updated: '2026-09-05T00:00:00Z',
    description: 'A timer for one thing at a time.',
    payload: `payload/${POMODORO}-1.2.0.json`,
    sha256: digest.hex,
    requires: { os: null },
    capabilities: [],
    screenshots: [],
    releaseNotes: null,
    ...patch,
  };
  return { bytes, digest: digest.hex, pkg };
}

describe('joinUrl', () => {
  it('joins the same way with or without a trailing slash', () => {
    expect(joinUrl(STORE_BASE, 'index.json')).toEqual({
      ok: true,
      url: 'https://store.lumen.example/shelf/index.json',
    });
    expect(joinUrl(`${STORE_BASE}/`, 'index.json')).toEqual({
      ok: true,
      url: 'https://store.lumen.example/shelf/index.json',
    });
  });

  it('joins onto the root of a host', () => {
    expect(joinUrl('https://store.example', 'packages/a.b.json')).toEqual({
      ok: true,
      url: 'https://store.example/packages/a.b.json',
    });
  });

  it('drops a query and a fragment on the base', () => {
    expect(joinUrl(`${STORE_BASE}/?v=2#top`, 'index.json')).toEqual({
      ok: true,
      url: 'https://store.lumen.example/shelf/index.json',
    });
  });

  it('refuses a path that leaves the store', () => {
    const escaped = joinUrl(STORE_BASE, '../../secrets.json');
    expect(escaped.ok).toBe(false);
    if (!escaped.ok) expect(escaped.message).toContain('points outside');
  });

  it('refuses an absolute path and another host', () => {
    expect(joinUrl(STORE_BASE, '/etc/passwd').ok).toBe(false);
    expect(joinUrl(STORE_BASE, 'https://elsewhere.example/x.json').ok).toBe(false);
    expect(joinUrl(STORE_BASE, 'javascript:alert(1)').ok).toBe(false);
    expect(joinUrl(STORE_BASE, '').ok).toBe(false);
  });

  it('keeps a path that walks down and back up inside the store', () => {
    expect(joinUrl(STORE_BASE, 'packages/./a.json')).toEqual({
      ok: true,
      url: 'https://store.lumen.example/shelf/packages/a.json',
    });
  });

  it('refuses a base that is not an http address', () => {
    expect(joinUrl('store.lumen.example', 'index.json').ok).toBe(false);
    expect(joinUrl('file:///etc', 'index.json').ok).toBe(false);
  });
});

describe('the addresses of a store', () => {
  it('names each document', () => {
    expect(catalogueUrl(STORE_BASE)).toEqual({
      ok: true,
      url: 'https://store.lumen.example/shelf/index.json',
    });
    expect(packageUrl(STORE_BASE, POMODORO)).toEqual({
      ok: true,
      url: `https://store.lumen.example/shelf/packages/${POMODORO}.json`,
    });
    expect(bannerUrl(STORE_BASE, 'welcome')).toEqual({
      ok: true,
      url: 'https://store.lumen.example/shelf/banner/welcome.json',
    });
  });

  it('refuses an id that is not one', () => {
    expect(packageUrl(STORE_BASE, '../../etc/passwd').ok).toBe(false);
    expect(bannerUrl(STORE_BASE, '').ok).toBe(false);
  });

  it('takes a payload path from the package', () => {
    const pkg = { payload: 'payload/com.lumen.pomodoro-1.2.0.json' } as PayloadPackage;
    expect(payloadUrl(STORE_BASE, pkg)).toEqual({
      ok: true,
      url: 'https://store.lumen.example/shelf/payload/com.lumen.pomodoro-1.2.0.json',
    });
  });
});

describe('fetchCatalogue', () => {
  it('asks for index.json with a plain GET and no credentials', async () => {
    const stub = stubFetch(() => textResponse(JSON.stringify(catalogueJson())));
    const result = await fetchCatalogue(`${STORE_BASE}/`, { fetch: stub.fetch });
    expect(value(result).name).toBe('Lumen Store');
    expect(stub.calls[0]?.url).toBe('https://store.lumen.example/shelf/index.json');
    expect(stub.calls[0]?.init?.method).toBe('GET');
    expect(stub.calls[0]?.init?.credentials).toBe('omit');
  });

  it('reports a machine that cannot reach the store', async () => {
    const stub = stubFetch(() => {
      throw new TypeError('Failed to fetch');
    });
    const failure = error(await fetchCatalogue(STORE_BASE, { fetch: stub.fetch }));
    expect(failure.reason).toBe('offline');
    expect(failure.message).toContain('could not be reached');
  });

  it('reports the status the store answered with', async () => {
    const stub = stubFetch(() => response({ status: 404, statusText: 'Not Found' }));
    const failure = error(await fetchCatalogue(STORE_BASE, { fetch: stub.fetch }));
    expect(failure.reason).toBe('http');
    if (failure.reason !== 'http') return;
    expect(failure.status).toBe(404);
    expect(failure.message).toContain('404');
  });

  it('reports a body that did not parse', async () => {
    const stub = stubFetch(() => textResponse('<html>a login page</html>'));
    const failure = error(await fetchCatalogue(STORE_BASE, { fetch: stub.fetch }));
    expect(failure.reason).toBe('malformed');
    if (failure.reason !== 'malformed') return;
    expect(failure.problems[0]?.code).toBe('json');
  });

  it('reports a store written for a newer version of the OS', async () => {
    const stub = stubFetch(() => textResponse(JSON.stringify(catalogueJson({ format: 2 }))));
    const failure = error(await fetchCatalogue(STORE_BASE, { fetch: stub.fetch }));
    expect(failure.reason).toBe('malformed');
    if (failure.reason !== 'malformed') return;
    expect(isUnsupportedFormat(failure.problems)).toBe(true);
    expect(failure.message).toContain('format 2');
  });

  it('reports a body that is not text', async () => {
    const stub = stubFetch(() => response({ bytes: new Uint8Array([0xff, 0xfe, 0xfd]) }));
    const failure = error(await fetchCatalogue(STORE_BASE, { fetch: stub.fetch }));
    expect(failure.reason).toBe('malformed');
    expect(failure.message).toContain('not text');
  });

  it('stops reading a body with no end to it', async () => {
    // One megabyte, handed out over and over: the reader must give up at the
    // ceiling rather than hold whatever the store cares to send.
    const megabyte = new Uint8Array(1024 * 1024).fill(0x20);
    const chunks = Array.from({ length: 9 }, () => megabyte);
    let cancelled = false;
    const stub = stubFetch(() =>
      response({ bytes: megabyte, chunks, onCancel: () => (cancelled = true) }),
    );
    const failure = error(await fetchCatalogue(STORE_BASE, { fetch: stub.fetch }));
    expect(failure.reason).toBe('too-large');
    if (failure.reason !== 'too-large') return;
    expect(failure.limit).toBe(MAX_DOCUMENT_BYTES);
    expect(failure.received).toBeGreaterThan(MAX_DOCUMENT_BYTES);
    expect(cancelled).toBe(true);
  });

  it('refuses a base URL that is not a store address before asking anything', async () => {
    const stub = stubFetch(() => textResponse('{}'));
    const failure = error(await fetchCatalogue('store.lumen.example', { fetch: stub.fetch }));
    expect(failure.reason).toBe('url');
    expect(stub.calls).toHaveLength(0);
  });

  it('stops before asking when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const stub = stubFetch(() => textResponse('{}'));
    const failure = error(
      await fetchCatalogue(STORE_BASE, { fetch: stub.fetch, signal: controller.signal }),
    );
    expect(failure.reason).toBe('aborted');
    expect(stub.calls).toHaveLength(0);
  });

  it('reports a request the caller stopped', async () => {
    const stub = stubFetch(() => {
      const abort = new Error('The operation was aborted.');
      abort.name = 'AbortError';
      throw abort;
    });
    const failure = error(await fetchCatalogue(STORE_BASE, { fetch: stub.fetch }));
    expect(failure.reason).toBe('aborted');
  });
});

describe('fetchPackage', () => {
  it('reads packages/<id>.json', async () => {
    const stub = stubFetch(() => textResponse(JSON.stringify(packageJson())));
    const pkg = value(await fetchPackage(STORE_BASE, POMODORO, { fetch: stub.fetch }));
    expect(pkg.id).toBe(POMODORO);
    expect(stub.calls[0]?.url).toBe(`https://store.lumen.example/shelf/packages/${POMODORO}.json`);
  });

  it('refuses a document that calls itself something else', async () => {
    const stub = stubFetch(() => textResponse(JSON.stringify(packageJson({ id: 'com.other.x' }))));
    const failure = error(await fetchPackage(STORE_BASE, POMODORO, { fetch: stub.fetch }));
    expect(failure.reason).toBe('malformed');
    if (failure.reason !== 'malformed') return;
    expect(failure.problems[0]?.path).toBe('id');
  });
});

describe('fetchBanner', () => {
  it('reads banner/<id>.json', async () => {
    const stub = stubFetch(() => textResponse(JSON.stringify(bannerJson())));
    const banner = value(await fetchBanner(STORE_BASE, 'welcome', { fetch: stub.fetch }));
    expect(banner.target).toEqual({ kind: 'collection', id: 'essentials' });
    expect(stub.calls[0]?.url).toBe('https://store.lumen.example/shelf/banner/welcome.json');
  });
});

describe('fetchPayload', () => {
  it('checks the size and the digest, then reads the document', async () => {
    const text = JSON.stringify(appPayloadJson());
    const { bytes, digest, pkg } = await payloadFor(text);
    const stub = stubFetch(() => response({ bytes }));
    const payload = value(await fetchPayload(STORE_BASE, pkg, { fetch: stub.fetch }));
    expect(payload.sha256).toBe(digest);
    expect(payload.size).toBe(bytes.byteLength);
    expect(payload.document.kind).toBe('app');
    expect(stub.calls[0]?.url).toBe(
      `https://store.lumen.example/shelf/payload/${POMODORO}-1.2.0.json`,
    );
  });

  it('follows a streamed body against Content-Length', async () => {
    const text = JSON.stringify(appPayloadJson());
    const { bytes, pkg } = await payloadFor(text);
    const { chunks } = chunked(text, 16);
    const stub = stubFetch(() =>
      response({ bytes, chunks, headers: { 'Content-Length': String(bytes.byteLength) } }),
    );
    const seen: FetchProgress[] = [];
    const result = await fetchPayload(STORE_BASE, pkg, {
      fetch: stub.fetch,
      onProgress: (progress) => seen.push(progress),
    });
    expect(result.ok).toBe(true);
    expect(seen[0]).toEqual({ loaded: 0, total: bytes.byteLength });
    expect(seen).toHaveLength(chunks.length + 1);
    expect(seen.at(-1)).toEqual({ loaded: bytes.byteLength, total: bytes.byteLength });
  });

  it('falls back to indeterminate progress when the body cannot be read in pieces', async () => {
    const text = JSON.stringify(appPayloadJson());
    const { bytes, pkg } = await payloadFor(text);
    const stub = stubFetch(() =>
      response({ bytes, chunks: null, headers: { 'Content-Length': String(bytes.byteLength) } }),
    );
    const seen: FetchProgress[] = [];
    const result = await fetchPayload(STORE_BASE, pkg, {
      fetch: stub.fetch,
      onProgress: (progress) => seen.push(progress),
    });
    expect(result.ok).toBe(true);
    expect(seen[0]).toEqual({ loaded: 0, total: null });
    expect(seen.at(-1)).toEqual({ loaded: bytes.byteLength, total: bytes.byteLength });
  });

  it('leaves the total unknown when the store sends no length', async () => {
    const text = JSON.stringify(appPayloadJson());
    const { bytes, pkg } = await payloadFor(text);
    const { chunks } = chunked(text, 32);
    const stub = stubFetch(() => response({ bytes, chunks }));
    const seen: FetchProgress[] = [];
    await fetchPayload(STORE_BASE, pkg, {
      fetch: stub.fetch,
      onProgress: (progress) => seen.push(progress),
    });
    expect(seen.every((progress) => progress.total === null)).toBe(true);
  });

  it('reports a body that stopped short of the size the catalogue promised', async () => {
    const text = JSON.stringify(appPayloadJson());
    const { bytes, pkg } = await payloadFor(text);
    const truncated = bytes.subarray(0, bytes.byteLength - 20);
    const stub = stubFetch(() => response({ bytes: truncated, chunks: [truncated] }));
    const failure = error(await fetchPayload(STORE_BASE, pkg, { fetch: stub.fetch }));
    expect(failure.reason).toBe('size');
    if (failure.reason !== 'size') return;
    expect(failure.expected).toBe(bytes.byteLength);
    expect(failure.received).toBe(truncated.byteLength);
    expect(failure.message).toContain('less');
  });

  it('stops reading a body that runs past the promised size', async () => {
    const text = JSON.stringify(appPayloadJson());
    const { bytes, pkg } = await payloadFor(text, { size: 40 });
    const { chunks } = chunked(text, 16);
    let cancelled = false;
    const stub = stubFetch(() => response({ bytes, chunks, onCancel: () => (cancelled = true) }));
    const failure = error(await fetchPayload(STORE_BASE, pkg, { fetch: stub.fetch }));
    expect(failure.reason).toBe('size');
    if (failure.reason !== 'size') return;
    expect(failure.expected).toBe(40);
    expect(failure.received).toBeGreaterThan(40);
    expect(cancelled).toBe(true);
  });

  it('reports bytes that are the right length and the wrong file', async () => {
    const text = JSON.stringify(appPayloadJson());
    const { bytes, digest, pkg } = await payloadFor(text, { sha256: 'f'.repeat(64) });
    const stub = stubFetch(() => response({ bytes }));
    const failure = error(await fetchPayload(STORE_BASE, pkg, { fetch: stub.fetch }));
    expect(failure.reason).toBe('digest');
    if (failure.reason !== 'digest') return;
    expect(failure.expected).toBe('f'.repeat(64));
    expect(failure.received).toBe(digest);
  });

  it('says when it cannot compute a checksum at all', async () => {
    const text = JSON.stringify(appPayloadJson());
    const { bytes, pkg } = await payloadFor(text);
    const stub = stubFetch(() => response({ bytes }));
    const failure = error(await fetchPayload(STORE_BASE, pkg, { fetch: stub.fetch, subtle: null }));
    expect(failure.reason).toBe('unverifiable');
    expect(failure.message).toContain('secure');
  });

  it('reports a verified payload that is not the kind the package promised', async () => {
    const text = JSON.stringify(fontPayloadJson());
    const { bytes, pkg } = await payloadFor(text);
    const stub = stubFetch(() => response({ bytes }));
    const failure = error(await fetchPayload(STORE_BASE, pkg, { fetch: stub.fetch }));
    expect(failure.reason).toBe('malformed');
  });

  it('refuses a payload path that leaves the store before asking for it', async () => {
    const text = JSON.stringify(appPayloadJson());
    const { pkg } = await payloadFor(text, { payload: '../../../secrets.json' });
    const stub = stubFetch(() => textResponse('{}'));
    const failure = error(await fetchPayload(STORE_BASE, pkg, { fetch: stub.fetch }));
    expect(failure.reason).toBe('url');
    expect(stub.calls).toHaveLength(0);
  });
});
