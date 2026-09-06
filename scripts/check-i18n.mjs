#!/usr/bin/env node
/**
 * LU-1301 asks that no interface text stay in the source language when
 * another language is chosen, and that a scanner enforce it. This is that
 * scanner: inside the files listed in `TRANSLATED` it fails on any string a
 * person would read that has not gone through the dictionary, and everywhere
 * it fails on a `t()` key that `packages/kernel/src/i18n/en.ts` does not have.
 *
 * The list is opt-in, and that is the whole design. The interface has some
 * three thousand strings; a scanner that demanded all of them at once would
 * turn the build red against six hundred files and make the work
 * all-or-nothing. Opting in file by file means each migration is a small,
 * reviewable, individually green commit, and `pnpm check:i18n` reports what
 * is actually done rather than what is intended. Widen it by adding a path.
 *
 * It parses with the TypeScript compiler already in the tree rather than
 * matching text, because a regular expression cannot tell a label from a
 * Tailwind class or a file path, and a scanner that cries wolf gets switched
 * off.
 *
 * Escape hatches, in the shape the design-slop scanner already uses:
 * `i18n-ignore-file`, `i18n-ignore-next-line`, `i18n-ignore` on the line. Each
 * wants a reason after it.
 *
 * Run: node scripts/check-i18n.mjs
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The files whose text has been translated. Add a path here in the same
 * commit that migrates it; the check then keeps it translated.
 */
const TRANSLATED = [
  'packages/shell/src/menubar/MenuBar.tsx',
  'packages/shell/src/menubar/systemBarMenu.ts',
  'packages/apps/src/settings/sections.ts',
  'packages/apps/src/settings/pages/Region.tsx',
];

/** Props whose value is read out by a person or a screen reader. */
const TEXT_PROPS = new Set([
  'alt',
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'description',
  'heading',
  'hint',
  'label',
  'legend',
  'message',
  'placeholder',
  'subtitle',
  'summary',
  'title',
  'tooltip',
]);

/** Object keys that carry text in the menu and section tables. */
const TEXT_KEYS = new Set([
  'description',
  'detail',
  'header',
  'hint',
  'label',
  'message',
  'placeholder',
  'subtitle',
  'summary',
  'title',
]);

const keys = dictionaryKeys();
const problems = [];

for (const path of TRANSLATED) checkTranslated(path);
for (const path of everySource()) checkKeys(path);

if (problems.length > 0) {
  console.error('Interface text that will not translate:\n');
  for (const problem of problems) console.error(`  ${problem}`);
  console.error(
    `\nEither move the string into packages/kernel/src/i18n/en.ts and read it with t()/useT(),` +
      `\nor mark the line \`i18n-ignore <reason>\` if it is not text a person reads.`,
  );
  process.exit(1);
}

console.log(
  `${TRANSLATED.length} files translated, every t() key present in the dictionary (${keys.size} keys).`,
);

/** Every key `en.ts` defines, as written. */
function dictionaryKeys() {
  const file = parse('packages/kernel/src/i18n/en.ts');
  const found = new Set();
  const walk = (node) => {
    if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) found.add(node.name.text);
    ts.forEachChild(node, walk);
  };
  // Only the object literal `en` is a dictionary; the type aliases below it
  // are not, and neither is anything a future edit adds beside them.
  const walkTop = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'en' &&
      node.initializer
    ) {
      walk(node.initializer);
      return;
    }
    ts.forEachChild(node, walkTop);
  };
  walkTop(file);
  if (found.size === 0) fail('packages/kernel/src/i18n/en.ts defines no keys');
  return found;
}

/** Text inside an opted-in file that never reaches the dictionary. */
function checkTranslated(path) {
  const file = parse(path);
  const text = file.getFullText();
  if (/i18n-ignore-file\b/.test(text.slice(0, 2000))) return;
  const lineOf = (node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line;
  const lines = text.split('\n');
  const excused = (node) => {
    const line = lineOf(node);
    return (
      /i18n-ignore\b/.test(lines[line] ?? '') ||
      /i18n-ignore-next-line\b/.test(lines[line - 1] ?? '')
    );
  };
  const report = (node, what, value) => {
    if (excused(node)) return;
    problems.push(`${path}:${lineOf(node) + 1}  ${what} "${trim(value)}"`);
  };

  const walk = (node) => {
    if (ts.isJsxText(node) && /\p{L}/u.test(node.text))
      report(node, 'text in the markup', node.text);
    else if (ts.isJsxAttribute(node) && node.initializer) reportAttribute(node, report);
    else if (
      ts.isPropertyAssignment(node) &&
      TEXT_KEYS.has(nameOf(node.name)) &&
      isText(node.initializer)
    )
      report(node, `${nameOf(node.name)}:`, node.initializer.text);
    ts.forEachChild(node, walk);
  };
  walk(file);
}

function reportAttribute(node, report) {
  const name = nameOf(node.name);
  if (!TEXT_PROPS.has(name)) return;
  const value = node.initializer;
  if (ts.isStringLiteral(value)) report(node, `${name}=`, value.text);
  else if (
    ts.isJsxExpression(value) &&
    value.expression &&
    ts.isNoSubstitutionTemplateLiteral(value.expression)
  )
    report(node, `${name}=`, value.expression.text);
}

/** A `t('…')` or `useT()('…')` key the dictionary does not define. */
function checkKeys(path) {
  const file = parse(path);
  const walk = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const named =
        (ts.isIdentifier(callee) && callee.text === 't') ||
        (ts.isPropertyAccessExpression(callee) && callee.name.text === 't');
      const first = node.arguments[0];
      if (named && first) {
        if (isText(first)) {
          if (!keys.has(first.text))
            problems.push(
              `${relative(root, path)}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}  t("${first.text}") is not in the dictionary`,
            );
        } else if (composed(first)) {
          // A key stitched together at run time can be neither typechecked nor
          // found here, so `t('menu.' + name)` has to become a branch. A key
          // held in a typed variable — `t(section.labelKey)` — is fine: the
          // compiler already knows it is a `MessageKey`.
          problems.push(
            `${relative(root, path)}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}  t() takes a key stitched together at run time`,
          );
        }
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(file);
}

/** A key built by concatenation or interpolation rather than named outright. */
function composed(node) {
  if (ts.isTemplateExpression(node)) return true;
  return ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken;
}

function isText(node) {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
}

function nameOf(name) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) ? name.text : '';
}

function trim(value) {
  const one = value.replace(/\s+/g, ' ').trim();
  return one.length > 48 ? `${one.slice(0, 45)}…` : one;
}

function parse(path) {
  const full = path.startsWith('/') ? path : join(root, path);
  let source;
  try {
    source = readFileSync(full, 'utf8');
  } catch {
    fail(`${path} is listed as translated and does not exist`);
  }
  return ts.createSourceFile(full, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** Every source file that could call `t`. */
function everySource() {
  const out = [];
  const skip = new Set(['node_modules', 'dist', 'coverage', '.turbo']);
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (skip.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  for (const pkg of ['packages/kernel/src', 'packages/shell/src', 'packages/apps/src'])
    walk(join(root, pkg));
  return out;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
