/**
 * Fetch a web page on the browser app's behalf.
 *
 * Lumen's browser draws a page in an iframe, and a great many sites refuse to
 * be framed: `X-Frame-Options: SAMEORIGIN` and `frame-ancestors` are how a
 * site says "not inside someone else's page", and a real browser honours that
 * for frames while opening the same site perfectly well at the top level.
 * Lumen has no top level to open into — it *is* a page — so the only way to
 * show one of those sites is to fetch the document here and serve it from
 * Lumen's own origin, where the frame rule no longer applies.
 *
 * What is served is the document and nothing else. Stylesheets, scripts and
 * images are left pointing at the site through an injected `<base>`, so they
 * load from it directly, as they would anywhere. That keeps this to one
 * request per page rather than a mirror of the whole web, and it is why a
 * site that fetches its own API from script will still come up bare: the
 * frame is sandboxed, its origin is null, and the site's CORS rules say no.
 * That limit is real and the browser says so rather than pretending.
 *
 * The guards below are the price of running this on a public host:
 *
 * - http and https only, and never an address inside the network this runs
 *   on — every hop of every redirect is resolved and checked, because a
 *   redirect is how a fetch of a public name ends up at 169.254.169.254.
 * - No credentials, in either direction: nothing is sent, and `set-cookie`
 *   never comes back.
 * - A size cap and a deadline, so one request cannot become the whole month's
 *   bandwidth or a socket held open for an hour.
 * - It answers the app it belongs to, not the internet: a request with no
 *   sign of coming from this origin is refused, which is what stops it being
 *   an open proxy for anyone who finds the URL.
 */

import { lookup } from 'node:dns/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';

/** Ten seconds is longer than a page a person is waiting for should take. */
export const PAGE_TIMEOUT_MS = 10_000;
/** Documents larger than this are not pages, they are downloads. */
export const MAX_PAGE_BYTES = 5 * 1024 * 1024;
/** A redirect chain longer than this is a loop or a trick. */
export const MAX_REDIRECTS = 5;

export interface PageResult {
  status: number;
  /** Always set; the body is text either way, so a refusal reads as a page. */
  contentType: string;
  body: string;
  /** Set when this is a refusal rather than a page, for the log. */
  problem?: string;
}

function refuse(status: number, problem: string): PageResult {
  return { status, contentType: 'text/plain; charset=utf-8', body: problem, problem };
}

/**
 * Addresses that are not the public internet.
 *
 * Written out rather than pulled from a library because the list is short,
 * fixed, and the one piece of this file it would be worst to get wrong.
 */
export function isPrivateAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) {
    const [a = 0, b = 0] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true; // link-local, and the metadata service
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }
  if (kind === 6) {
    const v6 = address.toLowerCase();
    if (v6 === '::' || v6 === '::1') return true;
    if (v6.startsWith('fe80') || v6.startsWith('fc') || v6.startsWith('fd')) return true;
    // An IPv4 address wearing an IPv6 coat is still that address.
    const mapped = v6.startsWith('::ffff:') ? v6.slice(7) : null;
    if (mapped && isIP(mapped) === 4) return isPrivateAddress(mapped);
    return false;
  }
  return false;
}

/** Resolve a host and say whether every address it has is on the public internet. */
export async function hostIsPublic(hostname: string): Promise<boolean> {
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (isIP(bare)) return !isPrivateAddress(bare);
  if (bare === 'localhost' || bare.endsWith('.localhost') || bare.endsWith('.local')) return false;
  try {
    const addresses = await lookup(bare, { all: true });
    if (addresses.length === 0) return false;
    return addresses.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/** An address this will fetch: http or https, with a host that is not ours. */
export async function acceptableTarget(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (!(await hostIsPublic(url.hostname))) return null;
  return url;
}

/**
 * Whether a request came from the app rather than from someone who found the
 * address. `Sec-Fetch-Site` is set by the browser and cannot be set by a
 * page, so it is the useful half; the referrer check is for the browsers that
 * do not send it. Neither is proof, and neither is meant to be — this is the
 * difference between a feature and an open proxy, not an authentication.
 */
export function fromThisApp(headers: {
  secFetchSite?: string | null;
  referer?: string | null;
  host?: string | null;
}): boolean {
  const site = headers.secFetchSite;
  if (site) return site === 'same-origin' || site === 'same-site';
  const referer = headers.referer;
  if (!referer || !headers.host) return false;
  try {
    return new URL(referer).host === headers.host;
  } catch {
    return false;
  }
}

/** Read a response body up to the cap, and say if it ran over. */
async function readCapped(response: Response): Promise<{ text: string; tooLarge: boolean }> {
  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > MAX_PAGE_BYTES) return { text: '', tooLarge: true };
  const reader = response.body?.getReader();
  if (!reader) return { text: await response.text(), tooLarge: false };
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    if (chunk.value === undefined) continue;
    size += chunk.value.byteLength;
    if (size > MAX_PAGE_BYTES) {
      await reader.cancel().catch(() => {});
      return { text: '', tooLarge: true };
    }
    chunks.push(chunk.value);
  }
  const joined = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    joined.set(chunk, at);
    at += chunk.byteLength;
  }
  return { text: new TextDecoder('utf-8').decode(joined), tooLarge: false };
}

/**
 * One line of script, so the frame can say it arrived.
 *
 * The frame is sandboxed without `allow-same-origin` — a page fetched from
 * anywhere must not get Lumen's origin, its storage or its cookies — which
 * means the browser cannot read the document to see whether it loaded. The
 * `load` event is no answer either: it waits for every image and script the
 * page asks for, and one slow asset would leave a page that is on screen and
 * readable being reported as blocked.
 *
 * So the document says so itself. It sends one message, carries no data, and
 * changes nothing else about the page.
 */
const READY_SIGNAL =
  '<script>try{parent.postMessage({lumen:"page-ready"},"*");' +
  'addEventListener("DOMContentLoaded",function(){' +
  'try{parent.postMessage({lumen:"page-ready"},"*")}catch(e){}})}catch(e){}</script>';

/**
 * Give the document a `<base>`, so every relative link and asset in it
 * resolves against the site it came from rather than against Lumen.
 *
 * A document that already has one is left alone: the site has said where its
 * relative URLs point and it knows better than this does.
 */
export function withBase(html: string, url: string): string {
  if (/<base\b/i.test(html)) return html;
  const tag = `<base href="${url.replace(/"/g, '&quot;')}">${READY_SIGNAL}`;
  const head = html.match(/<head\b[^>]*>/i);
  if (head?.index !== undefined) {
    const at = head.index + head[0].length;
    return html.slice(0, at) + tag + html.slice(at);
  }
  const html_ = html.match(/<html\b[^>]*>/i);
  if (html_?.index !== undefined) {
    const at = html_.index + html_[0].length;
    return `${html.slice(0, at)}<head>${tag}</head>${html.slice(at)}`;
  }
  return tag + html;
}

/**
 * Fetch one page, following redirects by hand so every hop is checked.
 *
 * `fetch` would follow them itself, and then only the first address would
 * have been looked at — which is exactly the hole a redirect to an internal
 * address is meant to go through.
 */
export async function loadPage(raw: string, doFetch = fetch): Promise<PageResult> {
  let target = await acceptableTarget(raw);
  if (!target) return refuse(400, 'That address cannot be fetched from here.');

  const deadline = AbortSignal.timeout(PAGE_TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    let response: Response;
    try {
      response = await doFetch(target.href, {
        method: 'GET',
        redirect: 'manual',
        credentials: 'omit',
        signal: deadline,
        headers: {
          // A plain, honest request. No cookies, no referrer, and a user
          // agent that says what this is rather than impersonating a browser.
          accept: 'text/html,application/xhtml+xml',
          'accept-language': 'en',
          'user-agent': 'LumenOS/1.0 (+https://github.com/lumenpearson/os)',
        },
      });
    } catch (e) {
      const timedOut = deadline.aborted;
      return refuse(
        timedOut ? 504 : 502,
        timedOut ? 'The site did not answer in time.' : `The site could not be reached: ${e}`,
      );
    }

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      const next = await acceptableTarget(new URL(location, target).href);
      if (!next) return refuse(400, 'That site redirected somewhere this will not follow.');
      target = next;
      continue;
    }

    const type = response.headers.get('content-type') ?? 'text/html; charset=utf-8';
    if (!/^text\/html|^application\/xhtml/i.test(type)) {
      return refuse(415, 'That address is a file rather than a page.');
    }
    const { text, tooLarge } = await readCapped(response);
    if (tooLarge) return refuse(413, 'That page is too large to show here.');
    return {
      status: response.status,
      contentType: 'text/html; charset=utf-8',
      body: withBase(text, target.href),
    };
  }
  return refuse(508, 'That site redirected too many times.');
}

/** One header, whatever shape the server handed it over in. */
function header(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * The endpoint itself, over a Node request and response.
 *
 * This is the shape the host calls a function in — `req.url` is a path and
 * `req.headers` is a plain object, not a `Request` with a `Headers` — and it
 * is also what a Vite middleware is handed, so the deployment and the dev
 * server run this same function rather than two copies of it that can drift.
 * They drifted: the deployed copy crashed on three separate counts before
 * anyone saw a page, and none of them could happen locally.
 */
export async function servePage(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const send = (status: number, body: string, type = 'text/plain; charset=utf-8') => {
    res.statusCode = status;
    res.setHeader('Content-Type', type);
    // Never indexed, never held in a shared cache, and never carrying a
    // referrer onward: this is someone else's page passing through.
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.end(body);
  };

  if (req.method !== 'GET') return send(405, 'Only GET.');
  // A base only to make the parse legal: `req.url` is a path, and nothing
  // below reads the host back out of it.
  const asked = new URL(req.url ?? '/', 'http://lumen.invalid');
  const target = asked.searchParams.get('url');
  if (!target) return send(400, 'No address given.');
  if (
    !fromThisApp({
      secFetchSite: header(req, 'sec-fetch-site'),
      referer: header(req, 'referer'),
      host: header(req, 'host'),
    })
  ) {
    return send(403, 'This address answers the Lumen browser, not the internet.');
  }

  const page = await loadPage(target);
  send(page.status, page.body, page.contentType);
}
