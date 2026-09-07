/**
 * `/api/page?url=…` — the page fetcher, as a Vercel function.
 *
 * The whole of the work is in `../server/page.ts`, which the dev and preview
 * servers run through a Vite plugin, so what a person sees locally is what
 * the deployment does.
 *
 * The `.js` on that import is not a typo and not optional. This package is
 * `"type": "module"`, and the host compiles each file on its own rather than
 * bundling them, so the specifier written here is the specifier Node is
 * handed at runtime — and Node's ESM resolver does not guess extensions.
 * Vite guessed, which is why an import that worked in dev for a week only
 * failed once deployed. TypeScript maps the `.js` back to this `.ts`.
 */

import { fromThisApp, loadPage } from '../server/page.js';

export const config = { runtime: 'nodejs' };

export default async function handler(request: Request): Promise<Response> {
  const headers = (name: string) => request.headers.get(name);
  /*
   * `request.url` is a path here — `/api/page?url=…` — not the absolute URL
   * a `Request` normally carries, so parsing it without a base throws and
   * the whole function 500s before any of the page logic runs. The base is
   * only ever used to make the parse legal; nothing below reads the host
   * from it. An absolute url ignores the base, so this holds either way.
   */
  const asked = new URL(request.url, `https://${headers('host') ?? 'lumen.invalid'}`);
  const url = asked.searchParams.get('url');
  const deny = (status: number, text: string) =>
    new Response(text, {
      status,
      headers: { 'content-type': 'text/plain; charset=utf-8', 'x-robots-tag': 'noindex' },
    });

  if (request.method !== 'GET') return deny(405, 'Only GET.');
  if (!url) return deny(400, 'No address given.');
  if (
    !fromThisApp({
      secFetchSite: headers('sec-fetch-site'),
      referer: headers('referer'),
      host: headers('host'),
    })
  ) {
    return deny(403, 'This address answers the Lumen browser, not the internet.');
  }

  const page = await loadPage(url);
  return new Response(page.body, {
    status: page.status,
    headers: {
      'content-type': page.contentType,
      // Never indexed, never cached by a shared cache, and never carrying a
      // cookie back: this is someone else's page passing through.
      'x-robots-tag': 'noindex, nofollow',
      'cache-control': 'private, max-age=0, must-revalidate',
      'referrer-policy': 'no-referrer',
    },
  });
}
