/**
 * Getting a store's files from a base URL.
 *
 * Every request is a plain `GET` with `credentials: 'omit'`, so the store
 * never learns who asked, and every path is resolved against the base URL and
 * checked to still be inside it: a catalogue that names `../../etc` or another
 * host is refused before a request is made.
 *
 * Failures are told apart because the storefront says a different sentence for
 * each: the machine is offline, the store answered with a status, the body did
 * not parse, the payload was the wrong length, the payload was the wrong
 * bytes, or the checksum could not be computed at all. Everything that goes
 * wrong ends up as a `StoreError`, never as a thrown exception.
 */

import { type DigestResult, digestsMatch, sha256Hex, subtleCrypto } from './digest';
import {
  describeProblems,
  isPackageId,
  isUnsupportedFormat,
  type ParseProblem,
  type ParseResult,
  parseBannerText,
  parseCatalogueText,
  parsePackageText,
  parsePayloadText,
} from './parse';
import type { Banner, Catalogue, PackageDocument, PayloadDocument, PayloadPackage } from './types';

export interface FetchProgress {
  /** Bytes received so far. */
  loaded: number;
  /**
   * Bytes expected in total, or null when the size is not known — no
   * `Content-Length`, or a response whose body cannot be read in pieces. Draw
   * an indeterminate bar for null.
   */
  total: number | null;
}

export interface FetchOptions {
  signal?: AbortSignal;
  onProgress?: (progress: FetchProgress) => void;
  /** The fetch to use. Defaults to the host's, bound to the global. */
  fetch?: typeof globalThis.fetch;
  /** The SubtleCrypto to verify with. Defaults to the host's, which an insecure origin lacks. */
  subtle?: SubtleCrypto | null;
}

export type StoreError =
  | { reason: 'url'; message: string; base: string; path: string }
  | { reason: 'offline'; message: string; url: string; cause: unknown }
  | { reason: 'aborted'; message: string; url: string }
  | { reason: 'http'; message: string; url: string; status: number; statusText: string }
  | { reason: 'malformed'; message: string; url: string; problems: ParseProblem[] }
  | { reason: 'size'; message: string; url: string; expected: number; received: number }
  | { reason: 'too-large'; message: string; url: string; limit: number; received: number }
  | { reason: 'digest'; message: string; url: string; expected: string; received: string }
  | { reason: 'unverifiable'; message: string; url: string };

export type StoreResult<T> = { ok: true; value: T } | { ok: false; error: StoreError };

/** A payload that arrived whole, was the length the catalogue promised and hashed to its digest. */
export interface VerifiedPayload {
  id: string;
  version: string;
  size: number;
  /** The digest of the bytes received, which equals the one the package named. */
  sha256: string;
  document: PayloadDocument;
}

export type UrlResult = { ok: true; url: string } | { ok: false; message: string };

const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * How much of a document this client will read when the catalogue has not
 * said how long it is. A payload is bounded by the size its package declared;
 * this bounds everything else, so a store cannot hand the storefront a body
 * with no end to it.
 */
export const MAX_DOCUMENT_BYTES = 8 * 1024 * 1024;

/**
 * The base URL as a directory: with or without a trailing slash it means the
 * same store, and a query or fragment on it is not part of a file's address.
 */
function baseUrl(base: string): URL | null {
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  url.search = '';
  url.hash = '';
  if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
  return url;
}

/** Resolve a path from the catalogue against the base URL, or say why not. */
export function joinUrl(base: string, path: string): UrlResult {
  const root = baseUrl(base);
  if (root === null) {
    return {
      ok: false,
      message: `"${base}" is not a store address. It reads like https://host/store.`,
    };
  }
  if (path.length === 0) return { ok: false, message: 'The store named an empty path.' };
  if (SCHEME.test(path) || path.startsWith('/')) {
    return { ok: false, message: `"${path}" is not a path inside the store.` };
  }
  let resolved: URL;
  try {
    resolved = new URL(path, root);
  } catch {
    return { ok: false, message: `"${path}" is not a path inside the store.` };
  }
  // `..` in a path resolves above the base; a store may only address its own
  // files, so anything that lands outside is refused rather than requested.
  if (!resolved.href.startsWith(root.href)) {
    return { ok: false, message: `"${path}" points outside ${root.href}.` };
  }
  return { ok: true, url: resolved.href };
}

export function catalogueUrl(base: string): UrlResult {
  return joinUrl(base, 'index.json');
}

export function packageUrl(base: string, id: string): UrlResult {
  if (!isPackageId(id)) return { ok: false, message: `"${id}" is not a package identifier.` };
  return joinUrl(base, `packages/${id}.json`);
}

export function bannerUrl(base: string, id: string): UrlResult {
  if (!isPackageId(id)) return { ok: false, message: `"${id}" is not a banner identifier.` };
  return joinUrl(base, `banner/${id}.json`);
}

export function payloadUrl(base: string, pkg: PayloadPackage): UrlResult {
  return joinUrl(base, pkg.payload);
}

function urlError(base: string, path: string, message: string): StoreError {
  return { reason: 'url', message, base, path };
}

function resolveFetch(options: FetchOptions): typeof globalThis.fetch | null {
  if (options.fetch) return options.fetch;
  // A browser's fetch throws when called detached from the global object.
  return typeof globalThis.fetch === 'function' ? globalThis.fetch.bind(globalThis) : null;
}

function isAbort(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) return true;
  return error instanceof Error && error.name === 'AbortError';
}

function httpMessage(status: number, statusText: string): string {
  if (status === 404) return 'The store has no such file (404).';
  if (status === 401 || status === 403) return `The store refused the request (${status}).`;
  if (status >= 500) return `The store is having trouble (${status}).`;
  const detail = statusText.trim().length > 0 ? ` ${statusText}` : '';
  return `The store answered ${status}${detail}.`;
}

function contentLength(response: Response): number | null {
  const raw = response.headers?.get('content-length') ?? null;
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function concat(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function tooLargeError(url: string, received: number): StoreError {
  return {
    reason: 'too-large',
    url,
    limit: MAX_DOCUMENT_BYTES,
    received,
    message: `This file is larger than the ${MAX_DOCUMENT_BYTES / (1024 * 1024)} MB a catalogue may be.`,
  };
}

function sizeError(url: string, expected: number, received: number): StoreError {
  const direction = received > expected ? 'more' : 'less';
  return {
    reason: 'size',
    url,
    expected,
    received,
    message: `The download is ${direction} than the catalogue promised: ${received} bytes where it said ${expected}.`,
  };
}

/**
 * The bytes at a URL, with progress where the body can be read in pieces.
 * `expectedSize` is the catalogue's figure: reading stops the moment more than
 * that has arrived, so a store cannot hand a tile a stream without an end.
 */
async function fetchBytes(
  url: string,
  options: FetchOptions,
  expectedSize: number | null,
): Promise<StoreResult<Uint8Array>> {
  const doFetch = resolveFetch(options);
  if (doFetch === null) {
    return {
      ok: false,
      error: { reason: 'offline', url, cause: null, message: 'This system cannot make requests.' },
    };
  }
  const { signal, onProgress } = options;
  if (signal?.aborted) {
    return { ok: false, error: { reason: 'aborted', url, message: 'The download was stopped.' } };
  }

  let response: Response;
  try {
    response = await doFetch(url, {
      method: 'GET',
      credentials: 'omit',
      redirect: 'follow',
      signal: signal ?? null,
    });
  } catch (e) {
    if (isAbort(e, signal)) {
      return { ok: false, error: { reason: 'aborted', url, message: 'The download was stopped.' } };
    }
    return {
      ok: false,
      error: {
        reason: 'offline',
        url,
        cause: e,
        message: 'The store could not be reached. Check the connection and the address.',
      },
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: {
        reason: 'http',
        url,
        status: response.status,
        statusText: response.statusText,
        message: httpMessage(response.status, response.statusText),
      },
    };
  }

  const limit = expectedSize ?? MAX_DOCUMENT_BYTES;
  const total = contentLength(response);
  const body = response.body;
  const streamed = typeof body?.getReader === 'function';
  onProgress?.({ loaded: 0, total: streamed ? total : null });

  let bytes: Uint8Array;
  if (!streamed || body === null) {
    // No readable body: the whole thing arrives at once, so progress can only
    // say "in flight" and then "done".
    try {
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (e) {
      if (isAbort(e, signal)) {
        return {
          ok: false,
          error: { reason: 'aborted', url, message: 'The download was stopped.' },
        };
      }
      return {
        ok: false,
        error: {
          reason: 'offline',
          url,
          cause: e,
          message: 'The download stopped before the file was complete.',
        },
      };
    }
    onProgress?.({ loaded: bytes.byteLength, total: bytes.byteLength });
  } else {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;
    for (;;) {
      // Typed from the reader so the DOM lib's own chunk type is used.
      let chunk: Awaited<ReturnType<typeof reader.read>>;
      try {
        chunk = await reader.read();
      } catch (e) {
        if (isAbort(e, signal)) {
          return {
            ok: false,
            error: { reason: 'aborted', url, message: 'The download was stopped.' },
          };
        }
        return {
          ok: false,
          error: {
            reason: 'offline',
            url,
            cause: e,
            message: 'The download stopped before the file was complete.',
          },
        };
      }
      if (chunk.done) break;
      const value = chunk.value;
      if (value === undefined) continue;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress?.({ loaded, total });
      if (loaded > limit) {
        await reader.cancel().catch(() => {});
        return {
          ok: false,
          error:
            expectedSize === null
              ? tooLargeError(url, loaded)
              : sizeError(url, expectedSize, loaded),
        };
      }
    }
    bytes = concat(chunks, loaded);
  }

  if (expectedSize === null && bytes.byteLength > limit) {
    return { ok: false, error: tooLargeError(url, bytes.byteLength) };
  }
  if (expectedSize !== null && bytes.byteLength !== expectedSize) {
    return { ok: false, error: sizeError(url, expectedSize, bytes.byteLength) };
  }
  return { ok: true, value: bytes };
}

function decode(bytes: Uint8Array, url: string): StoreResult<string> {
  try {
    return { ok: true, value: new TextDecoder('utf-8', { fatal: true }).decode(bytes) };
  } catch {
    return {
      ok: false,
      error: {
        reason: 'malformed',
        url,
        problems: [{ path: '', code: 'json', message: 'The file is not UTF-8 text.' }],
        message: 'This file from the store is not text.',
      },
    };
  }
}

function malformed(url: string, problems: ParseProblem[]): StoreError {
  const detail = describeProblems(problems);
  return {
    reason: 'malformed',
    url,
    problems,
    message: isUnsupportedFormat(problems)
      ? detail
      : `This file from the store could not be read. ${detail}`,
  };
}

async function fetchDocument<T>(
  url: string,
  options: FetchOptions,
  read: (text: string) => ParseResult<T>,
): Promise<StoreResult<T>> {
  const bytes = await fetchBytes(url, options, null);
  if (!bytes.ok) return bytes;
  const text = decode(bytes.value, url);
  if (!text.ok) return text;
  const parsed = read(text.value);
  if (!parsed.ok) return { ok: false, error: malformed(url, parsed.problems) };
  return { ok: true, value: parsed.value };
}

/** `index.json` from a base URL, with or without its trailing slash. */
export async function fetchCatalogue(
  base: string,
  options: FetchOptions = {},
): Promise<StoreResult<Catalogue>> {
  const url = catalogueUrl(base);
  if (!url.ok) return { ok: false, error: urlError(base, 'index.json', url.message) };
  return fetchDocument(url.url, options, parseCatalogueText);
}

/** `packages/<id>.json`. A document that names a different id is refused. */
export async function fetchPackage(
  base: string,
  id: string,
  options: FetchOptions = {},
): Promise<StoreResult<PackageDocument>> {
  const url = packageUrl(base, id);
  if (!url.ok) return { ok: false, error: urlError(base, `packages/${id}.json`, url.message) };
  const document = await fetchDocument(url.url, options, parsePackageText);
  if (!document.ok) return document;
  if (document.value.id !== id) {
    return {
      ok: false,
      error: malformed(url.url, [
        {
          path: 'id',
          code: 'inconsistent',
          message: `This file is served as ${id} but calls itself ${document.value.id}.`,
        },
      ]),
    };
  }
  return document;
}

/** `banner/<id>.json`. */
export async function fetchBanner(
  base: string,
  id: string,
  options: FetchOptions = {},
): Promise<StoreResult<Banner>> {
  const url = bannerUrl(base, id);
  if (!url.ok) return { ok: false, error: urlError(base, `banner/${id}.json`, url.message) };
  const document = await fetchDocument(url.url, options, parseBannerText);
  if (!document.ok) return document;
  if (document.value.id !== id) {
    return {
      ok: false,
      error: malformed(url.url, [
        {
          path: 'id',
          code: 'inconsistent',
          message: `This file is served as ${id} but calls itself ${document.value.id}.`,
        },
      ]),
    };
  }
  return document;
}

/**
 * The payload a package names, checked against the size and digest it
 * promised before a word of it is read as a document.
 */
export async function fetchPayload(
  base: string,
  pkg: PayloadPackage,
  options: FetchOptions = {},
): Promise<StoreResult<VerifiedPayload>> {
  const url = payloadUrl(base, pkg);
  if (!url.ok) return { ok: false, error: urlError(base, pkg.payload, url.message) };

  const bytes = await fetchBytes(url.url, options, pkg.size);
  if (!bytes.ok) return bytes;

  const subtle = options.subtle === undefined ? subtleCrypto() : options.subtle;
  const digest: DigestResult = await sha256Hex(bytes.value, subtle);
  if (!digest.ok) {
    return { ok: false, error: { reason: 'unverifiable', url: url.url, message: digest.message } };
  }
  if (!digestsMatch(digest.hex, pkg.sha256)) {
    return {
      ok: false,
      error: {
        reason: 'digest',
        url: url.url,
        expected: pkg.sha256,
        received: digest.hex,
        message: `The download is not the file the catalogue describes: its checksum is ${digest.hex}, not ${pkg.sha256}.`,
      },
    };
  }

  const text = decode(bytes.value, url.url);
  if (!text.ok) return text;
  const parsed = parsePayloadText(pkg.kind, text.value);
  if (!parsed.ok) return { ok: false, error: malformed(url.url, parsed.problems) };

  return {
    ok: true,
    value: {
      id: pkg.id,
      version: pkg.version,
      size: bytes.value.byteLength,
      sha256: digest.hex,
      document: parsed.value,
    },
  };
}
