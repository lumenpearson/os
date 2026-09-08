#!/usr/bin/env node
/**
 * The landing page lists the built-in apps. This checks that the list is the
 * one the OS actually ships — same apps, same order — because a landing page
 * that names an app the registry does not have is a claim about the product
 * that is not true, and nothing else in the build would notice.
 *
 * It reads the sources as text rather than importing them: the landing site
 * does not depend on `@lumen/apps` and should not start doing so for a check.
 *
 * Run: node scripts/check-app-list.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = join(root, 'packages/apps/src/registry.ts');
const landingPath = join(root, 'apps/landing/src/content/apps.ts');

const registry = readFileSync(registryPath, 'utf8');
const landing = readFileSync(landingPath, 'utf8');

/** `import files from './files';` → { files: 'files' } */
const folders = new Map();
for (const match of registry.matchAll(/^import\s+(\w+)\s+from\s+'\.\/([\w-]+)';$/gm)) {
  folders.set(match[1], match[2]);
}

const listing = registry.match(/export const builtinApps[^=]*=\s*\[([\s\S]*?)\];/);
if (!listing) fail(`could not find builtinApps in ${registryPath}`);

/** The registry's own order, which is the order the Start menu lists. */
const order = listing[1]
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean);

const shipped = [];
for (const binding of order) {
  const folder = folders.get(binding);
  if (!folder) fail(`builtinApps lists "${binding}", which nothing imports`);
  const source = readFileSync(join(root, 'packages/apps/src', folder, 'index.tsx'), 'utf8');
  // Hidden apps are hosts and system dialogs; no launcher shows them, so the
  // landing page should not either.
  if (/^\s*hidden:\s*true,/m.test(source)) continue;
  const name = source.match(/\bname:\s*'([^']+)'/);
  if (!name) fail(`${folder}/index.tsx has no name`);
  shipped.push(name[1]);
}

const listed = [...landing.matchAll(/\bname:\s*'([^']+)'/g)].map((match) => match[1]);

const missing = shipped.filter((name) => !listed.includes(name));
const invented = listed.filter((name) => !shipped.includes(name));
const problems = [];
for (const name of missing) problems.push(`the OS ships "${name}" and the landing page omits it`);
for (const name of invented)
  problems.push(`the landing page claims "${name}" and the OS has no such app`);
if (problems.length === 0 && shipped.join('\n') !== listed.join('\n')) {
  problems.push(
    `the same apps in a different order:\n  registry: ${shipped.join(', ')}\n  landing:  ${listed.join(', ')}`,
  );
}

if (problems.length > 0) {
  console.error('App list out of step with the registry:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\nRegistry: ${registryPath}\nLanding:  ${landingPath}`);
  process.exit(1);
}

console.log(`Landing page lists the same ${shipped.length} apps as the registry, in order.`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
