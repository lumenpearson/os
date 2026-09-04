#!/usr/bin/env node
/**
 * Fails when two module files in the same directory have basenames that differ
 * only by case — `Visualiser.tsx` beside `visualiser.ts`.
 *
 * On Linux those are two files and `import './Visualiser'` resolves to exactly
 * one of them. On macOS and Windows the filesystem is case-insensitive, the
 * bundler asks for `./Visualiser` and can be handed `visualiser.ts` instead,
 * and the build dies on a missing export. It cost a red Windows installer
 * build to find, and it is invisible to every check that runs on Linux — so
 * this guard runs everywhere and the platform-specific builds do not have to
 * be the thing that catches it.
 *
 * Extensions are deliberately part of the comparison only insofar as they are
 * stripped first: `icon.png` beside `icon.ico` is fine, because nobody imports
 * an icon by extensionless path.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const MODULE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

/** directory -> lowercased basename -> the paths that share it */
const byDirectory = new Map();

for (const file of files) {
  const extension = path.extname(file);
  if (!MODULE_EXTENSIONS.has(extension)) continue;
  const directory = path.dirname(file);
  const stem = path.basename(file, extension);
  const group = byDirectory.get(directory) ?? new Map();
  const key = stem.toLowerCase();
  group.set(key, [...(group.get(key) ?? []), file]);
  byDirectory.set(directory, group);
}

const collisions = [];
for (const [directory, group] of byDirectory) {
  for (const [, paths] of group) {
    // Same stem in the same case is just one module with several extensions,
    // which is a different (and much louder) problem than this one.
    const distinct = new Set(paths.map((p) => path.basename(p, path.extname(p))));
    if (paths.length > 1 && distinct.size > 1) collisions.push({ directory, paths });
  }
}

if (collisions.length === 0) {
  console.log(`No case-only module collisions across ${files.length} tracked files.`);
  process.exit(0);
}

console.error('Module names that differ only by case, in the same directory:\n');
for (const { directory, paths } of collisions) {
  console.error(`  ${directory}/`);
  for (const p of paths) console.error(`    ${path.basename(p)}`);
  console.error('');
}
console.error(
  'These resolve ambiguously on macOS and Windows. Rename one so the two\nmodules differ by more than capitalisation.',
);
process.exit(1);
