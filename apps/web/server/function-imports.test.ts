import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The deployment compiles each file in `api/` on its own and does not bundle
 * them, so a relative import is handed to Node's ESM resolver exactly as it
 * is written. That resolver does not guess extensions; Vite does. So an
 * import written without one runs in dev and preview, passes every test, and
 * then fails on the deployment with `ERR_MODULE_NOT_FOUND` — which is what
 * happened to `/api/page`, and is invisible until someone opens the site.
 *
 * This reads the sources rather than the types, because the type checker is
 * happy either way: `moduleResolution: "bundler"` accepts both spellings.
 */

// The suite runs from the package root; `import.meta.url` is an http URL
// under the DOM environment this package tests in, so it is no use here.
const API = join(process.cwd(), 'api');
const RELATIVE = /\bfrom\s+'(\.[^']*)'|\bimport\s*\(\s*'(\.[^']*)'\s*\)/g;

describe('the imports a deployed function makes', () => {
  const files = readdirSync(API).filter((f) => f.endsWith('.ts'));

  it('has functions to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(files)('%s spells out the extension on every relative import', (file) => {
    const source = readFileSync(join(API, file), 'utf8');
    const bare: string[] = [];
    for (const match of source.matchAll(RELATIVE)) {
      const specifier = match[1] ?? match[2];
      if (specifier && !/\.[cm]?js$/.test(specifier)) bare.push(specifier);
    }
    expect(bare, `${file} imports these without an extension`).toEqual([]);
  });
});
