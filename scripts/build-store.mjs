#!/usr/bin/env node
/**
 * Build the static store catalogue from `store/src/`.
 *
 * Reads the authored modules, checks them, and writes `store/index.json`,
 * `store/packages/<id>.json`, `store/payload/<id>-<version>.json` and
 * `store/banner/<id>.json`. Sizes and digests are taken from the bytes that
 * were actually written, never from the source object, because those bytes are
 * what a client fetches and checks.
 *
 * The build refuses to emit a catalogue it cannot defend: a duplicate or
 * malformed id, an id in the OS's own namespace, a payload that does not
 * survive a JSON round trip, a bundle naming a package that is not here, a
 * section or banner pointing at something missing. A half-valid catalogue is
 * worse than none, which is also how the client treats one.
 *
 * Usage:
 *   node scripts/build-store.mjs            build, then report what changed
 *   node scripts/build-store.mjs --check    verify the committed output matches
 *   node scripts/build-store.mjs --selftest run the validator checks and stop
 */

import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const STORE_DIR = fileURLToPath(new URL('../store/', import.meta.url));
const SOURCE = new URL('../store/src/index.mjs', import.meta.url);

const KINDS = new Set(['app', 'font', 'icons', 'bundle']);
const PRICES = new Set(['free', 'subscription']);
const CATEGORIES = new Set([
  'utilities',
  'developer',
  'office',
  'media',
  'internet',
  'games',
  'fonts',
  'icons',
  'bundles',
]);
const SHAPES = new Set(['rings', 'grid', 'ramp', 'type']);
const TONES = new Set(['accent', 'neutral']);
const TARGET_KINDS = new Set(['package', 'collection', 'section']);

const PACKAGE_ID = /^[a-z0-9_.-]{2,64}$/;
const ROW_ID = /^[a-z0-9][a-z0-9-]{1,47}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const MANIFEST_VERSION = /^\d+\.\d+(\.\d+)?$/;
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** The namespace the OS keeps for itself; a store id here would be shadowed. */
const RESERVED_PREFIX = 'lumen.';

class CatalogueError extends Error {}

function fail(where, message) {
  throw new CatalogueError(`${where}: ${message}`);
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(value, where, field, { min = 1, max = 20000 } = {}) {
  if (typeof value !== 'string') fail(where, `${field} must be a string`);
  if (value.length < min) fail(where, `${field} must be at least ${min} characters`);
  if (value.length > max) fail(where, `${field} must be at most ${max} characters`);
  return value;
}

function requireStamp(value, where, field) {
  requireString(value, where, field);
  if (!STAMP.test(value) || Number.isNaN(Date.parse(value))) {
    fail(where, `${field} must be an ISO instant such as 2026-09-05T00:00:00Z`);
  }
  return value;
}

function requireArtwork(value, where, field) {
  if (!isPlainObject(value)) fail(where, `${field} must be an object`);
  if (!SHAPES.has(value.shape)) {
    fail(where, `${field}.shape must be one of ${[...SHAPES].join(', ')}`);
  }
  if (!Number.isInteger(value.seed) || value.seed < 0 || value.seed > 9999) {
    fail(where, `${field}.seed must be a whole number from 0 to 9999`);
  }
  if (!TONES.has(value.tone)) fail(where, `${field}.tone must be accent or neutral`);
}

/**
 * Walk a value and refuse anything JSON would quietly drop or mangle.
 *
 * `JSON.stringify` turns `undefined` into a missing key, a function into
 * nothing at all and `NaN` into `null`. Any of those would produce a payload
 * whose digest is honest and whose contents are not what the author wrote.
 */
function assertJsonSafe(value, where, path, seen = new Set()) {
  const at = path || 'payload';
  if (value === null) return;
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return;
  if (type === 'number') {
    if (!Number.isFinite(value)) fail(where, `${at} is ${String(value)}, which JSON cannot hold`);
    return;
  }
  if (type === 'undefined') fail(where, `${at} is undefined`);
  if (type === 'function' || type === 'symbol' || type === 'bigint') {
    fail(where, `${at} is a ${type}, which JSON cannot hold`);
  }
  if (seen.has(value)) fail(where, `${at} is part of a cycle`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonSafe(item, where, `${at}[${index}]`, seen));
  } else {
    for (const [key, item] of Object.entries(value)) {
      assertJsonSafe(item, where, `${at}.${key}`, seen);
    }
  }
  seen.delete(value);
}

/** One JSON document, formatted the one way this build ever formats them. */
function serialise(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function validateAppPayload(manifest, where) {
  if (!isPlainObject(manifest)) fail(where, 'an app payload must be a manifest object');
  requireString(manifest.id, where, 'payload.id');
  if (!PACKAGE_ID.test(manifest.id)) fail(where, `payload.id "${manifest.id}" is malformed`);
  if (manifest.id.startsWith(RESERVED_PREFIX)) {
    fail(where, `payload.id "${manifest.id}" is in the OS namespace and would be shadowed`);
  }
  requireString(manifest.name, where, 'payload.name', { max: 64 });
  if (!manifest.alias && !manifest.html && !manifest.script) {
    fail(where, 'payload needs an alias, html or script');
  }
  if (manifest.html !== undefined) {
    requireString(manifest.html, where, 'payload.html', { min: 64, max: 400000 });
    if (!manifest.html.includes('<script')) {
      fail(where, 'payload.html has no script, so the program would not run');
    }
  }
  if (manifest.version !== undefined && !MANIFEST_VERSION.test(manifest.version)) {
    fail(where, `payload.version "${manifest.version}" is malformed`);
  }
  if (manifest.window !== undefined && !isPlainObject(manifest.window)) {
    fail(where, 'payload.window must be an object');
  }
}

function validateFontPayload(payload, where) {
  if (!isPlainObject(payload)) fail(where, 'a font payload must be an object');
  requireString(payload.family, where, 'payload.family', { max: 64 });
  if (!Array.isArray(payload.faces) || payload.faces.length === 0) {
    fail(where, 'payload.faces must list at least one face');
  }
  const seen = new Set();
  for (const [index, face] of payload.faces.entries()) {
    const at = `${where} face ${index}`;
    if (!isPlainObject(face)) fail(at, 'a face must be an object');
    requireString(face.weight, at, 'weight', { max: 16 });
    if (face.style !== 'normal' && face.style !== 'italic' && face.style !== 'oblique') {
      fail(at, 'style must be normal, italic or oblique');
    }
    requireString(face.src, at, 'src', { min: 32, max: 2000000 });
    if (!face.src.startsWith('data:font/')) {
      fail(at, 'src must be a data: URL, so a font never needs a second request');
    }
    const key = `${face.weight}/${face.style}`;
    if (seen.has(key)) fail(at, `${key} is declared twice, so one face would shadow the other`);
    seen.add(key);
  }
}

function validateIconsPayload(payload, where) {
  if (!isPlainObject(payload)) fail(where, 'an icons payload must be an object');
  requireString(payload.prefix, where, 'payload.prefix', { max: 24 });
  if (!/^[a-z][a-z0-9-]*$/.test(payload.prefix)) fail(where, 'payload.prefix is malformed');
  if (!isPlainObject(payload.icons)) fail(where, 'payload.icons must be an object');
  const names = Object.keys(payload.icons);
  if (names.length === 0) fail(where, 'payload.icons is empty');
  for (const name of names) {
    const at = `${where} icon "${name}"`;
    if (!/^[a-z][a-z0-9-]*$/.test(name)) fail(at, 'an icon name must be lower case and hyphenated');
    const path = payload.icons[name];
    requireString(path, at, 'path data', { min: 4, max: 2000 });
    if (!/^[Mm]/.test(path)) fail(at, 'path data must start with a move');
    if (/[^MmLlHhVvCcSsQqTtAaZz0-9.,\s+-]/.test(path)) {
      fail(at, 'path data has a character that is not a path command or a number');
    }
  }
}

function validateBundle(pkg, byId, where) {
  if (pkg.payload !== undefined) fail(where, 'a bundle has no payload; it names members instead');
  if (!Array.isArray(pkg.members) || pkg.members.length < 2) {
    fail(where, 'a bundle must name at least two members');
  }
  const seen = new Set();
  for (const member of pkg.members) {
    requireString(member, where, 'a member id');
    if (member === pkg.id) fail(where, 'a bundle cannot contain itself');
    if (seen.has(member)) fail(where, `member "${member}" is listed twice`);
    seen.add(member);
    const target = byId.get(member);
    if (!target) fail(where, `member "${member}" is not in this catalogue`);
    if (target.kind === 'bundle') {
      fail(where, `member "${member}" is itself a bundle, which the client will not unpack`);
    }
  }
}

function validatePackage(pkg, byId) {
  if (!isPlainObject(pkg)) fail('a package', 'must be an object');
  const where = `package "${pkg.id ?? '(no id)'}"`;
  requireString(pkg.id, where, 'id', { max: 64 });
  if (!PACKAGE_ID.test(pkg.id)) fail(where, 'id must match [a-z0-9_.-]{2,64}');
  if (!pkg.id.includes('.') || pkg.id.startsWith('.') || pkg.id.endsWith('.')) {
    fail(where, 'id must be reverse-dns, such as com.example.thing');
  }
  if (pkg.id.includes('..')) fail(where, 'id must not contain an empty label');
  if (pkg.id.startsWith(RESERVED_PREFIX)) {
    fail(where, 'id is in the OS namespace, where a built-in app would shadow it');
  }
  if (!KINDS.has(pkg.kind)) fail(where, `kind must be one of ${[...KINDS].join(', ')}`);
  requireString(pkg.name, where, 'name', { max: 48 });
  requireString(pkg.tagline, where, 'tagline', { max: 80 });
  requireString(pkg.description, where, 'description', { min: 120, max: 4000 });
  requireString(pkg.publisher, where, 'publisher', { max: 48 });
  requireString(pkg.releaseNotes, where, 'releaseNotes', { max: 400 });
  if (!VERSION.test(pkg.version ?? '')) fail(where, 'version must be major.minor.patch');
  if (!CATEGORIES.has(pkg.category)) {
    fail(where, `category must be one of ${[...CATEGORIES].join(', ')}`);
  }
  if (!PRICES.has(pkg.price)) fail(where, 'price must be free or subscription');
  requireStamp(pkg.updated, where, 'updated');
  if (!Array.isArray(pkg.keywords) || pkg.keywords.length === 0) {
    fail(where, 'keywords must list at least one word');
  }
  for (const keyword of pkg.keywords) requireString(keyword, where, 'a keyword', { max: 32 });
  if (!isPlainObject(pkg.requires) || typeof pkg.requires.os !== 'string') {
    fail(where, 'requires.os must be a version range such as >=0.1.0');
  }
  if (!Array.isArray(pkg.capabilities)) fail(where, 'capabilities must be an array');
  for (const capability of pkg.capabilities) {
    requireString(capability, where, 'a capability', { max: 24 });
  }
  if (!Array.isArray(pkg.screenshots)) fail(where, 'screenshots must be an array');
  pkg.screenshots.forEach((art, index) => requireArtwork(art, where, `screenshots[${index}]`));

  if (pkg.kind === 'bundle') {
    validateBundle(pkg, byId, where);
    return;
  }
  if (pkg.members !== undefined) fail(where, 'only a bundle may name members');
  if (pkg.payload === undefined) fail(where, 'a payload is required');
  assertJsonSafe(pkg.payload, where, 'payload');
  if (pkg.kind === 'app') validateAppPayload(pkg.payload, where);
  if (pkg.kind === 'font') validateFontPayload(pkg.payload, where);
  if (pkg.kind === 'icons') validateIconsPayload(pkg.payload, where);
}

function validateRows(rows, label, byId, { artwork = false } = {}) {
  const seen = new Set();
  for (const row of rows) {
    if (!isPlainObject(row)) fail(label, 'must be an object');
    const where = `${label} "${row.id ?? '(no id)'}"`;
    requireString(row.id, where, 'id', { max: 48 });
    if (!ROW_ID.test(row.id)) fail(where, 'id must be lower case and hyphenated');
    if (seen.has(row.id)) fail(where, 'id is used twice');
    seen.add(row.id);
    requireString(row.title, where, 'title', { max: 64 });
    if (artwork) {
      requireString(row.tagline, where, 'tagline', { max: 96 });
      requireArtwork(row.artwork, where, 'artwork');
    }
    if (!Array.isArray(row.packages) || row.packages.length === 0) {
      fail(where, 'must name at least one package');
    }
    const inRow = new Set();
    for (const id of row.packages) {
      requireString(id, where, 'a package id');
      if (inRow.has(id)) fail(where, `names "${id}" twice`);
      inRow.add(id);
      if (!byId.has(id)) fail(where, `names "${id}", which is not in this catalogue`);
    }
  }
  return seen;
}

function validateBanners(banners, byId, collectionIds, sectionIds) {
  const seen = new Set();
  for (const banner of banners) {
    if (!isPlainObject(banner)) fail('banner', 'must be an object');
    const where = `banner "${banner.id ?? '(no id)'}"`;
    requireString(banner.id, where, 'id', { max: 48 });
    if (!ROW_ID.test(banner.id)) fail(where, 'id must be lower case and hyphenated');
    if (seen.has(banner.id)) fail(where, 'id is used twice');
    seen.add(banner.id);
    requireString(banner.title, where, 'title', { max: 72 });
    requireString(banner.text, where, 'text', { max: 140 });
    requireArtwork(banner.artwork, where, 'artwork');
    if (!isPlainObject(banner.target)) fail(where, 'target must be an object');
    if (!TARGET_KINDS.has(banner.target.kind)) {
      fail(where, `target.kind must be one of ${[...TARGET_KINDS].join(', ')}`);
    }
    requireString(banner.target.id, where, 'target.id');
    const pools = {
      package: byId,
      collection: collectionIds,
      section: sectionIds,
    };
    if (!pools[banner.target.kind].has(banner.target.id)) {
      fail(where, `target "${banner.target.id}" does not exist`);
    }
  }
}

/** Everything the build checks before a single byte is written. */
export function validateCatalogue(catalogue) {
  const { packages, sections, collections, banners } = catalogue;
  if (catalogue.format !== 1) fail('catalogue', 'format must be 1');
  requireString(catalogue.name, 'catalogue', 'name', { max: 48 });
  requireStamp(catalogue.updated, 'catalogue', 'updated');
  if (!Array.isArray(packages) || packages.length === 0) {
    fail('catalogue', 'there are no packages');
  }

  const byId = new Map();
  for (const pkg of packages) {
    if (!isPlainObject(pkg) || typeof pkg.id !== 'string') fail('a package', 'has no id');
    if (byId.has(pkg.id)) fail(`package "${pkg.id}"`, 'id is used twice');
    byId.set(pkg.id, pkg);
  }
  // Members are resolved against the whole set, so ids are collected first.
  for (const pkg of packages) validatePackage(pkg, byId);

  const sectionIds = validateRows(sections, 'section', byId);
  const collectionIds = validateRows(collections, 'collection', byId, { artwork: true });
  validateBanners(banners, byId, collectionIds, sectionIds);

  const orphans = [...byId.keys()].filter((id) => {
    const inRow = [...sections, ...collections].some((row) => row.packages.includes(id));
    const inBundle = packages.some((p) => (p.members ?? []).includes(id));
    return !inRow && !inBundle;
  });
  if (orphans.length) {
    fail('catalogue', `nothing links to ${orphans.join(', ')}; add them to a section`);
  }
  return byId;
}

/** The fields the storefront needs to draw a tile, and no more. */
function summarise(pkg, size) {
  return {
    id: pkg.id,
    kind: pkg.kind,
    name: pkg.name,
    tagline: pkg.tagline,
    version: pkg.version,
    publisher: pkg.publisher,
    category: pkg.category,
    size,
    price: pkg.price,
    keywords: pkg.keywords,
    updated: pkg.updated,
  };
}

function document(pkg, size, payloadPath, sha256) {
  const doc = {
    ...summarise(pkg, size),
    description: pkg.description,
  };
  if (payloadPath) {
    doc.payload = payloadPath;
    doc.sha256 = sha256;
  }
  doc.requires = pkg.requires;
  doc.capabilities = pkg.capabilities;
  doc.screenshots = pkg.screenshots;
  doc.releaseNotes = pkg.releaseNotes;
  if (pkg.members) doc.members = pkg.members;
  return doc;
}

/** Queue one file for writing. Nothing touches the disk until every check has passed. */
function emit(files, relativePath, text) {
  files.set(relativePath, text);
}

async function writeAll(files, { check }) {
  let changed = 0;
  for (const [relativePath, text] of files) {
    const absolute = join(STORE_DIR, relativePath);
    let existing = null;
    try {
      existing = await readFile(absolute, 'utf8');
    } catch {
      existing = null;
    }
    if (existing === text) continue;
    changed += 1;
    if (check) {
      throw new CatalogueError(
        `${relativePath} is out of date; run "pnpm store" and commit the result`,
      );
    }
    await mkdir(join(absolute, '..'), { recursive: true });
    await writeFile(absolute, text, 'utf8');
  }
  return changed;
}

/** Delete generated files this build did not produce, so a rename leaves nothing behind. */
async function prune(files, { check }) {
  let removed = 0;
  for (const folder of ['packages', 'payload', 'banner']) {
    let entries = [];
    try {
      entries = await readdir(join(STORE_DIR, folder));
    } catch {
      continue;
    }
    for (const entry of entries) {
      const relativePath = `${folder}/${entry}`;
      if (files.has(relativePath)) continue;
      removed += 1;
      if (check) {
        throw new CatalogueError(`${relativePath} is not part of the catalogue any more`);
      }
      await rm(join(STORE_DIR, relativePath));
    }
  }
  return removed;
}

async function build({ check }) {
  const source = await import(SOURCE.href);
  const catalogue = {
    format: source.FORMAT_VERSION,
    name: source.STORE_NAME,
    updated: source.UPDATED,
    packages: source.PACKAGES,
    sections: source.SECTIONS,
    collections: source.COLLECTIONS,
    banners: source.BANNERS,
  };
  const byId = validateCatalogue(catalogue);

  const files = new Map();
  const sizes = new Map();
  const payloads = new Map();

  // Payloads first: their bytes are what every size and digest is taken from.
  for (const pkg of catalogue.packages) {
    if (pkg.kind === 'bundle') continue;
    const relativePath = `payload/${pkg.id}-${pkg.version}.json`;
    const text = serialise(pkg.payload);
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      fail(`package "${pkg.id}"`, `payload did not parse back: ${error.message}`);
    }
    if (serialise(parsed) !== text) {
      fail(`package "${pkg.id}"`, 'payload did not survive a JSON round trip');
    }
    const bytes = Buffer.from(text, 'utf8');
    sizes.set(pkg.id, bytes.byteLength);
    payloads.set(pkg.id, {
      path: relativePath,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    emit(files, relativePath, text);
  }

  // A bundle downloads its members, so its size is the sum of theirs.
  for (const pkg of catalogue.packages) {
    if (pkg.kind !== 'bundle') continue;
    sizes.set(
      pkg.id,
      pkg.members.reduce((total, member) => total + sizes.get(member), 0),
    );
  }

  for (const pkg of catalogue.packages) {
    const payload = payloads.get(pkg.id);
    emit(
      files,
      `packages/${pkg.id}.json`,
      serialise(document(pkg, sizes.get(pkg.id), payload?.path, payload?.sha256)),
    );
  }

  for (const banner of catalogue.banners) {
    emit(files, `banner/${banner.id}.json`, serialise(banner));
  }

  emit(
    files,
    'index.json',
    serialise({
      format: catalogue.format,
      name: catalogue.name,
      updated: catalogue.updated,
      packages: catalogue.packages.map((pkg) => summarise(pkg, sizes.get(pkg.id))),
      sections: catalogue.sections,
      banners: catalogue.banners,
      collections: catalogue.collections,
    }),
  );

  const changed = await writeAll(files, { check });
  const removed = await prune(files, { check });
  // Only real payloads are counted; a bundle's size is its members' sizes over again.
  const total = catalogue.packages
    .filter((pkg) => pkg.kind !== 'bundle')
    .reduce((sum, pkg) => sum + sizes.get(pkg.id), 0);
  return { files: files.size, changed, removed, packages: byId.size, bytes: total };
}

/* --------------------------------------------------------------------------
 * Checks for the validator itself.
 *
 * These run before every build. They are cheap, they touch no files, and they
 * are the only thing standing between a typo in this script and a catalogue
 * that passes validation without being valid.
 * ----------------------------------------------------------------------- */

function samplePackage(overrides = {}) {
  return {
    id: 'com.example.thing',
    kind: 'app',
    name: 'Thing',
    tagline: 'A thing that does a thing.',
    version: '1.0.0',
    publisher: 'Example',
    category: 'utilities',
    price: 'free',
    keywords: ['thing'],
    updated: '2026-01-01T00:00:00Z',
    description:
      'A description long enough to satisfy the minimum length the build asks for, '.repeat(2),
    releaseNotes: 'First release.',
    requires: { os: '>=0.1.0' },
    capabilities: [],
    screenshots: [],
    payload: {
      id: 'user.thing',
      name: 'Thing',
      html: `<style>body{color:#000}</style><p>Thing</p><script>lumen.setTitle('Thing');</script>`,
    },
    ...overrides,
  };
}

function sampleCatalogue(packages, extra = {}) {
  return {
    format: 1,
    name: 'Test Store',
    updated: '2026-01-01T00:00:00Z',
    packages,
    sections: [{ id: 'all', title: 'All', packages: packages.map((p) => p.id) }],
    collections: [],
    banners: [],
    ...extra,
  };
}

function refuses(label, catalogue, fragment) {
  try {
    validateCatalogue(catalogue);
  } catch (error) {
    if (!(error instanceof CatalogueError)) throw error;
    if (!error.message.includes(fragment)) {
      throw new Error(
        `${label}: expected a message containing "${fragment}", got "${error.message}"`,
      );
    }
    return;
  }
  throw new Error(`${label}: the catalogue was accepted when it should have been refused`);
}

function accepts(label, catalogue) {
  try {
    validateCatalogue(catalogue);
  } catch (error) {
    throw new Error(`${label}: a valid catalogue was refused — ${error.message}`);
  }
}

export function selftest() {
  const checks = [];
  const check = (name, run) => {
    run();
    checks.push(name);
  };

  check('a plain catalogue is accepted', () => {
    accepts('plain', sampleCatalogue([samplePackage()]));
  });

  check('a duplicate id is refused', () => {
    refuses('duplicate id', sampleCatalogue([samplePackage(), samplePackage()]), 'used twice');
  });

  check('a malformed id is refused', () => {
    refuses(
      'malformed id',
      sampleCatalogue([samplePackage({ id: 'Com.Example.Thing' })]),
      'id must match',
    );
  });

  check('an id outside reverse-dns is refused', () => {
    refuses('flat id', sampleCatalogue([samplePackage({ id: 'thing' })]), 'reverse-dns');
  });

  check('an id in the OS namespace is refused', () => {
    refuses(
      'reserved id',
      sampleCatalogue([samplePackage({ id: 'lumen.editor' })]),
      'OS namespace',
    );
  });

  check('a manifest id in the OS namespace is refused', () => {
    const pkg = samplePackage();
    pkg.payload = { ...pkg.payload, id: 'lumen.editor' };
    refuses('reserved manifest id', sampleCatalogue([pkg]), 'would be shadowed');
  });

  check('a payload JSON cannot hold is refused', () => {
    const pkg = samplePackage();
    pkg.payload = { ...pkg.payload, window: { width: Number.NaN } };
    refuses('unserialisable payload', sampleCatalogue([pkg]), 'JSON cannot hold');
  });

  check('a payload with a cycle is refused', () => {
    const pkg = samplePackage();
    const loop = { id: 'user.thing', name: 'Thing', html: pkg.payload.html };
    loop.self = loop;
    pkg.payload = loop;
    refuses('cyclic payload', sampleCatalogue([pkg]), 'cycle');
  });

  check('an app with no script is refused', () => {
    const pkg = samplePackage();
    pkg.payload = { id: 'user.thing', name: 'Thing', html: '<p>'.padEnd(80, '.') };
    refuses('scriptless app', sampleCatalogue([pkg]), 'no script');
  });

  check('a font face that is not a data URL is refused', () => {
    const pkg = samplePackage({
      id: 'com.example.face',
      kind: 'font',
      category: 'fonts',
      payload: {
        family: 'Example',
        faces: [{ weight: '400', style: 'normal', src: 'https://example.com/fonts/example.woff2' }],
      },
    });
    refuses('remote font', sampleCatalogue([pkg]), 'data: URL');
  });

  check('two identical font faces are refused', () => {
    const src = `data:font/ttf;base64,${'A'.repeat(64)}`;
    const pkg = samplePackage({
      id: 'com.example.face',
      kind: 'font',
      category: 'fonts',
      payload: {
        family: 'Example',
        faces: [
          { weight: '400', style: 'normal', src },
          { weight: '400', style: 'normal', src },
        ],
      },
    });
    refuses('shadowed face', sampleCatalogue([pkg]), 'declared twice');
  });

  check('icon path data that is not a path is refused', () => {
    const pkg = samplePackage({
      id: 'com.example.marks',
      kind: 'icons',
      category: 'icons',
      payload: { prefix: 'mark', icons: { sun: 'circle(12,12,4)' } },
    });
    refuses('bad path', sampleCatalogue([pkg]), 'must start with a move');
  });

  check('a bundle naming a missing member is refused', () => {
    const bundle = samplePackage({
      id: 'com.example.kit',
      kind: 'bundle',
      category: 'bundles',
      payload: undefined,
      members: ['com.example.thing', 'com.example.missing'],
    });
    delete bundle.payload;
    refuses('missing member', sampleCatalogue([samplePackage(), bundle]), 'not in this catalogue');
  });

  check('a bundle inside a bundle is refused', () => {
    const inner = samplePackage({
      id: 'com.example.inner',
      kind: 'bundle',
      category: 'bundles',
      members: ['com.example.thing', 'com.example.other'],
    });
    delete inner.payload;
    const outer = samplePackage({
      id: 'com.example.outer',
      kind: 'bundle',
      category: 'bundles',
      members: ['com.example.thing', 'com.example.inner'],
    });
    delete outer.payload;
    const other = samplePackage({ id: 'com.example.other' });
    refuses(
      'nested bundle',
      sampleCatalogue([samplePackage(), other, inner, outer]),
      'itself a bundle',
    );
  });

  check('a section naming a missing package is refused', () => {
    refuses(
      'missing section member',
      sampleCatalogue([samplePackage()], {
        sections: [{ id: 'all', title: 'All', packages: ['com.example.gone'] }],
      }),
      'not in this catalogue',
    );
  });

  check('a banner pointing nowhere is refused', () => {
    refuses(
      'dangling banner',
      sampleCatalogue([samplePackage()], {
        banners: [
          {
            id: 'hello',
            title: 'Hello',
            text: 'One sentence.',
            target: { kind: 'collection', id: 'nowhere' },
            artwork: { shape: 'grid', seed: 1, tone: 'accent' },
          },
        ],
      }),
      'does not exist',
    );
  });

  check('a package nothing links to is refused', () => {
    refuses(
      'orphan',
      sampleCatalogue([samplePackage(), samplePackage({ id: 'com.example.lonely' })], {
        sections: [{ id: 'all', title: 'All', packages: ['com.example.thing'] }],
      }),
      'nothing links to',
    );
  });

  check('a malformed artwork recipe is refused', () => {
    refuses(
      'bad artwork',
      sampleCatalogue([
        samplePackage({ screenshots: [{ shape: 'photo', seed: 1, tone: 'accent' }] }),
      ]),
      'screenshots[0].shape',
    );
  });

  return checks;
}

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const only = args.includes('--selftest');

  const checks = selftest();
  if (only) {
    console.log(`store: ${checks.length} validator checks passed`);
    return;
  }

  const result = await build({ check });
  const kilobytes = (result.bytes / 1024).toFixed(1);
  if (check) {
    console.log(`store: ${result.files} files are up to date (${result.packages} packages)`);
    return;
  }
  console.log(
    `store: ${result.packages} packages, ${result.files} files, ${kilobytes} kB of payload`,
  );
  console.log(
    `store: ${checks.length} validator checks passed, ${result.changed} written, ${result.removed} removed`,
  );
}

// Only build when run as a command; importing the module should not write files.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    if (error instanceof CatalogueError) {
      console.error(`store: ${error.message}`);
      process.exitCode = 1;
      return;
    }
    console.error(error);
    process.exitCode = 1;
  });
}
