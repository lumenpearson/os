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

import { randomUUID } from 'node:crypto';
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
  /**
   * The policy the page is served under, when it is a page. It names the one
   * nonce Lumen's own script carries, so nothing else in the document can
   * run — whatever the strip did or did not catch.
   */
  contentSecurityPolicy?: string;
  /** Set when this is a refusal rather than a page, for the log. */
  problem?: string;
}

/** What a site says about being put in a frame by the origin that asked. */
export type FrameVerdict = 'allowed' | 'refused' | 'unknown';

export interface PageProbe {
  frame: FrameVerdict;
  /** The header that refused, as the site wrote it; null when none did. */
  header: string | null;
  /** Where the address ended up after redirects. */
  url: string;
  /** Why the site could not be asked, for `unknown`. */
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

// ── would the site let Lumen frame it? ────────────────────────────────────

/**
 * A frame that a site refuses fires `load` on the iframe exactly as one that
 * succeeded does, and never fires `error`. Measured in Chromium against both
 * `X-Frame-Options: DENY` and `frame-ancestors 'self'`: `load` fired, `error`
 * did not. So the page doing the embedding cannot tell a page that arrived
 * from a page that was turned away — it can only see the headers, and a
 * cross-origin frame hides those from it.
 *
 * The server has no such problem: it made the request and it holds the
 * response. So it reads the two headers that decide the question and the
 * browser asks it before choosing between a frame and the relay.
 */

/** The `frame-ancestors` source list of every policy in a CSP header. */
export function frameAncestors(csp: string): string[][] {
  const found: string[][] = [];
  // One header may carry several policies, separated by commas, and a
  // browser enforces all of them; each is a list of `;`-separated directives.
  for (const policy of csp.split(',')) {
    for (const directive of policy.split(';')) {
      const parts = directive.trim().split(/\s+/).filter(Boolean);
      if (parts.shift()?.toLowerCase() === 'frame-ancestors') found.push(parts);
    }
  }
  return found;
}

/** The port a URL uses, written out even when it is the scheme's default. */
function portOf(origin: URL): string {
  return origin.port || (origin.protocol === 'https:' ? '443' : '80');
}

function defaultPort(origin: URL): string {
  return origin.protocol === 'https:' ? '443' : '80';
}

/** Whether one `frame-ancestors` source covers the origin doing the asking. */
export function matchesOrigin(source: string, origin: URL): boolean {
  const value = source.trim().toLowerCase();
  if (!value) return false;
  if (value === '*') return true;
  // `'self'` is the site itself and `'none'` is nobody: neither is ever us.
  if (value.startsWith("'")) return false;
  // A scheme on its own. `http:` covers https too, as the grammar has it.
  if (/^[a-z][a-z0-9+.-]*:$/.test(value)) {
    if (value === 'http:') return origin.protocol === 'http:' || origin.protocol === 'https:';
    return value === origin.protocol;
  }
  const match = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^/:]+)(?::(\*|\d+))?/.exec(value);
  if (!match) return false;
  const [, scheme, wildcard, host, port] = match;
  if (!host) return false;
  if (scheme && `${scheme}:` !== origin.protocol) {
    // Same upgrade rule: a source written http:// also covers https.
    if (!(scheme === 'http' && origin.protocol === 'https:')) return false;
  }
  const theirs = origin.hostname.toLowerCase();
  if (wildcard ? !theirs.endsWith(`.${host}`) : theirs !== host) return false;
  // A source with no port means the scheme's default port and no other.
  if (port === undefined) return portOf(origin) === defaultPort(origin);
  return port === '*' || port === portOf(origin);
}

/**
 * Whether `asking` may frame a document that came back with these headers.
 *
 * Anything that cannot be read as permission is read as refusal: being wrong
 * that way costs a page fetched through Lumen that need not have been, and
 * being wrong the other way costs a blank frame with no way to tell why.
 */
export function frameRule(
  headers: { frameOptions?: string | null; policy?: string | null },
  asking: string,
): { framable: boolean; header: string | null } {
  let origin: URL;
  try {
    origin = new URL(asking);
  } catch {
    return { framable: false, header: null };
  }

  const lists = frameAncestors(headers.policy ?? '');
  if (lists.length > 0) {
    // Where both are sent, `frame-ancestors` is the one browsers obey.
    const allowed = lists.every((sources) => sources.some((s) => matchesOrigin(s, origin)));
    const written = lists.map((sources) => sources.join(' ')).join(', ');
    return {
      framable: allowed,
      header: allowed ? null : `Content-Security-Policy: frame-ancestors ${written}`,
    };
  }

  const xfo = (headers.frameOptions ?? '').trim();
  if (!xfo) return { framable: true, header: null };
  const value = xfo.toLowerCase();
  if (value === 'allowall') return { framable: true, header: null };
  if (value.startsWith('allow-from')) {
    let allowed = false;
    try {
      allowed = new URL(xfo.slice('allow-from'.length).trim()).origin === origin.origin;
    } catch {
      allowed = false;
    }
    return { framable: allowed, header: allowed ? null : `X-Frame-Options: ${xfo}` };
  }
  return { framable: false, header: `X-Frame-Options: ${xfo}` };
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
 * The script the served document carries. Two jobs, both of which only the
 * document itself can do.
 *
 * **It says it arrived.** The frame is sandboxed without `allow-same-origin`
 * — a page fetched from anywhere must not get Lumen's origin, its storage or
 * its cookies — so the browser cannot read the document to see whether it
 * loaded. `load` is no answer either: it waits for every image and script the
 * page asks for, so one slow asset would have a readable page reported as
 * blocked, and it fires just the same for a frame that was refused.
 *
 * **It keeps the browsing inside the browser.** The `<base>` points every
 * relative address at the site, which is what makes the page's own images and
 * stylesheets load — and it points the page's links there too, so a link
 * followed from a relayed page went straight back to the site, into a frame
 * the site refuses, and the page went blank. That is the second half of the
 * defect and it is why a search could be typed but never run.
 *
 * So a plain left click on a link, and a GET form's submission, are stopped
 * and handed to Lumen instead, which goes there exactly as it would if the
 * address had been typed: the tab's history, its address bar and its Back
 * button all follow, and the next page is judged on its own headers rather
 * than inheriting this one's.
 *
 * Handing it up rather than going there directly is also the only thing that
 * works. This document is sandboxed to an opaque origin, so a request it
 * makes for itself arrives with `Sec-Fetch-Site: cross-site` and is turned
 * away by the guard that keeps this endpoint from being an open proxy. Asked
 * for by Lumen, the request is same-origin, like any other.
 *
 * A POST is left alone. This endpoint fetches with GET and nothing else, and
 * a form that submits to the site is more honest than one quietly turned into
 * a different request.
 */
export function relayScript(nonce = ''): string {
  const on = nonce === '' ? '' : ` nonce="${nonce}"`;
  return `<script${on}>(function(){
function tell(kind,url){try{parent.postMessage({lumen:kind,url:url},"*")}catch(e){}}
function absolute(raw){try{var u=new URL(raw,document.baseURI);
return u.protocol==="http:"||u.protocol==="https:"?u:null}catch(e){return null}}
function goTo(raw){if(parent===window)return false;
var u=absolute(raw);if(!u)return false;tell("page-moved",u.href);return true}
tell("page-ready");
addEventListener("DOMContentLoaded",function(){tell("page-ready")});
addEventListener("click",function(e){
if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
var el=e.target,a=el&&el.closest?el.closest("a[href]"):null;if(!a)return;
var href=a.getAttribute("href");if(!href||href.charAt(0)==="#")return;
if(goTo(href))e.preventDefault()},true);
addEventListener("submit",function(e){var form=e.target;
if(e.defaultPrevented||!form||(form.method||"get").toLowerCase()!=="get")return;
var action=absolute(form.getAttribute("action")||"");if(!action)return;
var params=new URLSearchParams(),data;
try{data=new FormData(form,e.submitter)}catch(err){try{data=new FormData(form)}catch(err2){return}}
data.forEach(function(value,name){if(typeof value==="string")params.append(name,value)});
action.search=params.toString();
if(goTo(action.href))e.preventDefault()},true)})()</script>`;
}

const BASE_TAG = /<base\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/i;

/**
 * A policy that lets Lumen's one script run and nothing else's.
 *
 * The strip below keeps the page whole; this keeps it safe, and it is the
 * half that does not depend on getting string surgery right. A script the
 * scanner somehow missed still cannot execute, because it carries no nonce.
 * `object-src` closes the other way a document runs code. Nothing else is
 * restricted: the page's own styles, images and fonts are the page.
 */
function policyFor(nonce: string): string {
  return `script-src 'nonce-${nonce}'; object-src 'none'`;
}

/**
 * Take the site's own scripts out of the document.
 *
 * A relayed page is a reading copy, and its scripts cannot do their job here:
 * the frame is sandboxed to an opaque origin, so `document.cookie` and
 * `sessionStorage` throw on the first access, the site's own API calls are
 * refused by its CORS rules, and nothing can be signed in to. The banner over
 * the page says so already.
 *
 * What they can still do is destroy the page. A framework that throws while
 * hydrating unmounts what the server rendered, and the reader is left with a
 * blank white frame instead of an article that was sitting in the HTML all
 * along. Measured on vercel.com: with the scripts, nothing; without them, the
 * whole page.
 *
 * This walks the document rather than running a pattern over it, because the
 * pattern was wrong in the two ways a pattern always is here. An end tag may
 * carry rubbish — `</script bar>` and `</script\t\n>` both close the element
 * for a browser — and a `<script>` that is never closed runs to the end of
 * the file. A regex that ends at `</script\s*>` misses both, and leaves the
 * script it was meant to remove. The scanner below ends an element exactly
 * where the HTML parser's script-data state does.
 *
 * Inline `on*` handlers are left: they fire only on interaction, and removing
 * attributes needs a real parser. The nonce policy above is what stands
 * behind this in any case — this keeps the page whole; that keeps it safe.
 */
export function withoutScripts(html: string): string {
  let out = '';
  let at = 0;
  for (;;) {
    const open = openingScript(html, at);
    if (open < 0) return out + html.slice(at);
    out += html.slice(at, open);
    at = pastElement(html, pastStartTag(html, open));
  }
}

const SCRIPT = 'script';

/** A tag name ends at whitespace, `/`, `>`, or the end of the document. */
function endsName(c: string): boolean {
  return (
    c === '' ||
    c === '>' ||
    c === '/' ||
    c === ' ' ||
    c === '\t' ||
    c === '\n' ||
    c === '\f' ||
    c === '\r'
  );
}

/** Where the next `<script` start tag begins at or after `from`, or -1. */
function openingScript(html: string, from: number): number {
  for (let i = html.indexOf('<', from); i >= 0; i = html.indexOf('<', i + 1)) {
    if (html.slice(i + 1, i + 1 + SCRIPT.length).toLowerCase() !== SCRIPT) continue;
    if (!endsName(html.charAt(i + 1 + SCRIPT.length))) continue;
    return i;
  }
  return -1;
}

/** Just past the start tag opening at `open`, minding quoted attributes. */
function pastStartTag(html: string, open: number): number {
  let quote = '';
  for (let i = open + 1; i < html.length; i++) {
    const c = html.charAt(i);
    if (quote !== '') {
      if (c === quote) quote = '';
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i + 1;
  }
  return html.length;
}

/**
 * Just past the element whose content starts at `from`.
 *
 * An unterminated script is script data to the end of the document, for a
 * browser and so for this: everything after it goes.
 */
function pastElement(html: string, from: number): number {
  for (let i = html.indexOf('</', from); i >= 0; i = html.indexOf('</', i + 1)) {
    if (html.slice(i + 2, i + 2 + SCRIPT.length).toLowerCase() !== SCRIPT) continue;
    if (!endsName(html.charAt(i + 2 + SCRIPT.length))) continue;
    const close = html.indexOf('>', i + 2 + SCRIPT.length);
    return close < 0 ? html.length : close + 1;
  }
  return html.length;
}

/**
 * Give the document a `<base>`, so every relative link and asset in it
 * resolves against the site it came from rather than against Lumen, and the
 * script above, so it can report itself and keep its links in the relay.
 *
 * A `<base>` the site wrote itself is kept but made absolute against the
 * address it came from. The site wrote it expecting to be served from its own
 * origin; served from Lumen's, a relative one such as `/assets/` would point
 * every stylesheet and image at Lumen, and the page would arrive unstyled.
 */
export function withBase(html: string, url: string, nonce = ''): string {
  const existing = BASE_TAG.exec(html);
  const written = existing ? (existing[1] ?? existing[2] ?? existing[3] ?? '') : '';
  let href = url;
  if (existing) {
    try {
      href = new URL(written, url).href;
    } catch {
      href = url;
    }
  }
  const base = `<base href="${href.replace(/"/g, '&quot;')}">`;
  if (existing) {
    const at = existing.index;
    return html.slice(0, at) + base + relayScript(nonce) + html.slice(at + existing[0].length);
  }
  const tag = base + relayScript(nonce);
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
type Walk = { ok: true; response: Response; target: URL } | { ok: false; refusal: PageResult };

async function walk(raw: string, doFetch: typeof fetch, deadline: AbortSignal): Promise<Walk> {
  let target = await acceptableTarget(raw);
  if (!target) {
    return { ok: false, refusal: refuse(400, 'That address cannot be fetched from here.') };
  }

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
      return {
        ok: false,
        refusal: refuse(
          timedOut ? 504 : 502,
          timedOut ? 'The site did not answer in time.' : `The site could not be reached: ${e}`,
        ),
      };
    }

    const location = response.headers.get('location');
    if (response.status >= 300 && response.status < 400 && location) {
      const next = await acceptableTarget(new URL(location, target).href);
      if (!next) {
        return {
          ok: false,
          refusal: refuse(400, 'That site redirected somewhere this will not follow.'),
        };
      }
      await response.body?.cancel().catch(() => {});
      target = next;
      continue;
    }
    return { ok: true, response, target };
  }
  return { ok: false, refusal: refuse(508, 'That site redirected too many times.') };
}

export async function loadPage(raw: string, doFetch = fetch): Promise<PageResult> {
  const walked = await walk(raw, doFetch, AbortSignal.timeout(PAGE_TIMEOUT_MS));
  if (!walked.ok) return walked.refusal;
  const { response, target } = walked;

  const type = response.headers.get('content-type') ?? 'text/html; charset=utf-8';
  if (!/^text\/html|^application\/xhtml/i.test(type)) {
    return refuse(415, 'That address is a file rather than a page.');
  }
  const { text, tooLarge } = await readCapped(response);
  if (tooLarge) return refuse(413, 'That page is too large to show here.');
  // One nonce per response, never reused, so a script cannot be written to
  // match a value seen on some earlier page.
  const nonce = randomUUID().replace(/-/g, '');
  return {
    status: response.status,
    contentType: 'text/html; charset=utf-8',
    body: withBase(withoutScripts(text), target.href, nonce),
    contentSecurityPolicy: policyFor(nonce),
  };
}

/**
 * Ask the site whether `asking` may put it in a frame, without reading a
 * page. Only the headers matter, so the body is dropped as soon as they have
 * arrived: one round trip, and none of the page's bytes.
 *
 * A site that cannot be reached from here is `unknown` rather than refused.
 * The relay runs on the same server as this, so "we could not reach it"
 * cannot be answered by relaying it, and the browser is better off asking the
 * site directly and saying plainly if that comes to nothing.
 */
export async function probePage(raw: string, asking: string, doFetch = fetch): Promise<PageProbe> {
  const walked = await walk(raw, doFetch, AbortSignal.timeout(PAGE_TIMEOUT_MS));
  if (!walked.ok) {
    return { frame: 'unknown', header: null, url: raw, problem: walked.refusal.problem };
  }
  const { response, target } = walked;
  await response.body?.cancel().catch(() => {});
  const rule = frameRule(
    {
      frameOptions: response.headers.get('x-frame-options'),
      policy: response.headers.get('content-security-policy'),
    },
    asking,
  );
  return {
    frame: rule.framable ? 'allowed' : 'refused',
    header: rule.header,
    url: target.href,
  };
}

/** One header, whatever shape the server handed it over in. */
function header(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name];
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

/**
 * The origin this is being served from, as the browser would write it.
 *
 * The frame rule is a question about a particular origin — may *this* page
 * frame that site — so the answer is only as good as knowing which one is
 * asking, and the request is the only place that says.
 *
 * `x-forwarded-proto` is what a host in front of this sets; behind nothing at
 * all, the socket says whether it is a TLS one.
 */
export function originOf(req: IncomingMessage): string {
  const host = header(req, 'host');
  if (!host) return '';
  const forwarded = header(req, 'x-forwarded-proto')?.split(',')[0]?.trim();
  // A socket is not guaranteed: the host may hand over a request that never
  // had one, and a test certainly does.
  const socket = req.socket as { encrypted?: boolean } | undefined;
  const secure = forwarded ? forwarded === 'https' : socket?.encrypted === true;
  return `${secure ? 'https' : 'http'}://${host}`;
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

  const origin = originOf(req);

  // The browser asks this before it decides between a frame and the relay: a
  // refused frame fires `load` like any other, so the answer cannot be had on
  // its side of the network.
  if (asked.searchParams.has('probe')) {
    const probe = await probePage(target, origin);
    return send(200, JSON.stringify(probe), 'application/json; charset=utf-8');
  }

  const page = await loadPage(target);
  if (page.contentSecurityPolicy !== undefined) {
    res.setHeader('Content-Security-Policy', page.contentSecurityPolicy);
  }
  send(page.status, page.body, page.contentType);
}
