#!/usr/bin/env node
/**
 * The end-to-end sweeps walk every app: one opens each at its declared
 * minimum size and fails on anything squeezed out of its box, the other
 * checks that a table's header lanes sit over its rows. Both read one list.
 *
 * A sweep that claims to cover every app and covers twenty-two of thirty-five
 * is worse than no sweep, because it is read as coverage. This keeps the list
 * honest: add an app to the OS without adding it here and the build fails,
 * naming it.
 *
 * Run: node scripts/check-e2e-app-list.mjs
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = join(root, 'packages/apps/src/registry.ts');
const helpersPath = join(root, 'apps/web/e2e/helpers.ts');

const registry = readFileSync(registryPath, 'utf8');
const helpers = readFileSync(helpersPath, 'utf8');

const folders = new Map();
for (const match of registry.matchAll(/^import\s+(\w+)\s+from\s+'\.\/([\w-]+)';$/gm)) {
  folders.set(match[1], match[2]);
}

const listing = registry.match(/export const builtinApps[^=]*=\s*\[([\s\S]*?)\];/);
if (!listing) fail(`could not find builtinApps in ${registryPath}`);

const shipped = [];
for (const binding of listing[1]
  .split(',')
  .map((entry) => entry.trim())
  .filter(Boolean)) {
  const folder = folders.get(binding);
  if (!folder) fail(`builtinApps lists "${binding}", which nothing imports`);
  const source = readFileSync(join(root, 'packages/apps/src', folder, 'index.tsx'), 'utf8');
  // Hidden apps have no launcher entry, so no sweep can open one.
  if (/^\s*hidden:\s*true,/m.test(source)) continue;
  const name = source.match(/\bname:\s*'([^']+)'/);
  if (!name) fail(`${folder}/index.tsx has no name`);
  shipped.push(name[1]);
}

const block = helpers.match(/export const BUILT_IN_APPS = \[([\s\S]*?)\] as const;/);
if (!block) fail(`could not find BUILT_IN_APPS in ${helpersPath}`);
const listed = [...block[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);

const problems = [];
for (const name of shipped) {
  if (!listed.includes(name)) problems.push(`the OS ships "${name}" and no sweep opens it`);
}
for (const name of listed) {
  if (!shipped.includes(name))
    problems.push(`the sweeps open "${name}", which the OS does not ship`);
}

if (problems.length > 0) {
  console.error('The end-to-end app list is out of step with the registry:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(`\nRegistry: ${registryPath}\nSweeps:   ${helpersPath}`);
  process.exit(1);
}

console.log(`Both end-to-end sweeps walk the same ${shipped.length} apps the registry ships.`);

function fail(message) {
  console.error(message);
  process.exit(1);
}
