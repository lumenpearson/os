/**
 * `/api/page?url=…` — the page fetcher, as a Vercel function.
 *
 * The whole of the work is in `../server/page.ts`, which the dev and preview
 * servers run through a Vite plugin, so what a person sees locally is what
 * the deployment does.
 */

import { fromThisApp, loadPage } from '../server/page';

export const config = { runtime: 'nodejs' };

export default async function handler(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get('url');
  const headers = (name: string) => request.headers.get(name);
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
