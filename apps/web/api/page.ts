/**
 * `/api/page?url=…` — the page fetcher, as a deployed function.
 *
 * All of the work is in `../server/page.ts`, which the dev and preview
 * servers run through a Vite plugin, so what a person sees locally is what
 * the deployment does. This file is only the doorway.
 *
 * Two things here are not style and must not be tidied away:
 *
 * - The `.js` on the import. This package is `"type": "module"` and the host
 *   compiles each file on its own rather than bundling them, so the specifier
 *   written here is the one Node's ESM resolver is handed at runtime, and
 *   that resolver does not guess extensions. Vite guesses, which is why an
 *   import without it worked in dev for a week and 500ed once deployed.
 * - The signature. The host calls a Node function with a request and a
 *   response, not with a `Request` — `req.url` is a path and `req.headers` is
 *   a plain object — so a handler written against the web shape throws on the
 *   first line that touches either.
 */

export { servePage as default } from '../server/page.js';

export const config = { runtime: 'nodejs' };
