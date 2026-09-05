/**
 * Reading a store's documents without trusting any of them.
 *
 * A catalogue arrives over the network from a host the OS does not control,
 * so every field here is hostile until checked: wrong types, missing keys,
 * an id that would shadow a built-in, a path that would walk out of the
 * store, path data with a `<` in it. The rule from `store/FORMAT.md` is that
 * a document with a problem is refused whole — a half-read catalogue draws a
 * storefront that lies — so each parser collects everything wrong with a
 * document and then returns no value at all.
 *
 * Unknown fields are ignored rather than refused: `format` is bumped only for
 * a breaking change, so a store may add fields within format 1 and older
 * clients must keep working.
 */

import type { AppManifest } from '@lumen/kernel';
import { errorsOf, validateManifest } from '../manifest';
import {
  ARTWORK_SHAPES,
  ARTWORK_TONES,
  type Artwork,
  BANNER_TARGET_KINDS,
  type Banner,
  type BannerTarget,
  type BundlePackage,
  CATALOGUE_FORMAT,
  type Catalogue,
  type Collection,
  type FontFace,
  type FontResource,
  type IconsResource,
  PACKAGE_KINDS,
  PACKAGE_PRICES,
  type PackageDocument,
  type PackageKind,
  type PackageRequirements,
  type PackageSummary,
  type PayloadDocument,
  type PayloadKind,
  type PayloadPackage,
  type Section,
} from './types';

export type ProblemCode =
  | 'json'
  | 'unsupported-format'
  | 'missing'
  | 'wrong-type'
  | 'bad-value'
  | 'duplicate'
  | 'inconsistent';

export interface ParseProblem {
  /** Dotted path of the field, or '' for the document as a whole. */
  path: string;
  code: ProblemCode;
  message: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; problems: ParseProblem[] };

/** Same rule as `store/FORMAT.md`: reverse-dns, lower case. */
const ID_PATTERN = /^[a-z0-9_.-]{2,64}$/;
const VERSION_PATTERN = /^\d+(\.\d+){0,3}(-[0-9a-z.-]+)?$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
/** A path inside the store: relative, no scheme, no walking upwards. */
const STORE_PATH = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/i;
/** The characters an SVG `d` attribute is made of, so markup cannot ride in. */
const SVG_PATH_DATA = /^[MmLlHhVvCcSsQqTtAaZz0-9eE+\-.,\s]+$/;
const FONT_WEIGHT = { min: 1, max: 1000 };
const MAX_TEXT = 20_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'nothing';
  if (Array.isArray(value)) return 'an array';
  const t = typeof value;
  if (t === 'object') return 'an object';
  if (t === 'number') return 'a number';
  if (t === 'boolean') return 'a boolean';
  if (t === 'string') return 'a string';
  return t;
}

function at(path: string, key: string | number): string {
  if (typeof key === 'number') return `${path}[${key}]`;
  return path.length === 0 ? key : `${path}.${key}`;
}

class Problems {
  readonly list: ParseProblem[] = [];

  add(path: string, code: ProblemCode, message: string): void {
    this.list.push({ path, code, message });
  }

  get failed(): boolean {
    return this.list.length > 0;
  }
}

/**
 * The one place a parser turns into a result. A value only escapes when
 * nothing at all went wrong, which is what "refused whole" means.
 */
function completed<T>(value: T | null, p: Problems): ParseResult<T> {
  if (value !== null && !p.failed) return { ok: true, value };
  if (p.failed) return { ok: false, problems: p.list };
  return { ok: false, problems: [{ path: '', code: 'bad-value', message: 'Could not be read.' }] };
}

function readObject(value: unknown, path: string, p: Problems): Record<string, unknown> | null {
  if (value === undefined || value === null) {
    p.add(path, 'missing', 'Required.');
    return null;
  }
  if (!isRecord(value)) {
    p.add(path, 'wrong-type', `Must be an object; this is ${typeName(value)}.`);
    return null;
  }
  return value;
}

function readString(value: unknown, path: string, p: Problems): string | null {
  if (value === undefined || value === null) {
    p.add(path, 'missing', 'Required.');
    return null;
  }
  if (typeof value !== 'string') {
    p.add(path, 'wrong-type', `Must be a string; this is ${typeName(value)}.`);
    return null;
  }
  if (value.length > MAX_TEXT) {
    p.add(path, 'bad-value', `Longer than ${MAX_TEXT} characters.`);
    return null;
  }
  return value;
}

/** A string that must carry something a person can read. */
function readText(value: unknown, path: string, p: Problems): string | null {
  const text = readString(value, path, p);
  if (text === null) return null;
  if (text.trim().length === 0) {
    p.add(path, 'bad-value', 'Required; this is empty.');
    return null;
  }
  return text;
}

function optionalText(value: unknown, path: string, p: Problems): string | null {
  if (value === undefined || value === null) return null;
  return readText(value, path, p);
}

function readMatch(value: unknown, path: string, p: Problems, pattern: RegExp, hint: string) {
  const text = readString(value, path, p);
  if (text === null) return null;
  if (!pattern.test(text)) {
    p.add(path, 'bad-value', hint);
    return null;
  }
  return text;
}

function readEnum<T extends string>(
  value: unknown,
  path: string,
  p: Problems,
  allowed: readonly T[],
): T | null {
  const text = readString(value, path, p);
  if (text === null) return null;
  if (!(allowed as readonly string[]).includes(text)) {
    p.add(path, 'bad-value', `Must be one of ${allowed.join(', ')}; this is "${text}".`);
    return null;
  }
  return text as T;
}

function readInteger(
  value: unknown,
  path: string,
  p: Problems,
  range: { min: number; max?: number },
): number | null {
  if (value === undefined || value === null) {
    p.add(path, 'missing', 'Required.');
    return null;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    p.add(path, 'wrong-type', `Must be a whole number; this is ${typeName(value)}.`);
    return null;
  }
  if (value < range.min || (range.max !== undefined && value > range.max)) {
    const bound = range.max === undefined ? `at least ${range.min}` : `${range.min}–${range.max}`;
    p.add(path, 'bad-value', `Must be ${bound}; this is ${value}.`);
    return null;
  }
  return value;
}

function readArray(value: unknown, path: string, p: Problems): unknown[] | null {
  if (value === undefined || value === null) {
    p.add(path, 'missing', 'Required.');
    return null;
  }
  if (!Array.isArray(value)) {
    p.add(path, 'wrong-type', `Must be an array; this is ${typeName(value)}.`);
    return null;
  }
  return value;
}

/** An absent list is an empty list; a list of the wrong type is a problem. */
function optionalArray(value: unknown, path: string, p: Problems): unknown[] {
  if (value === undefined || value === null) return [];
  return readArray(value, path, p) ?? [];
}

function readIdList(value: unknown, path: string, p: Problems): string[] {
  const items = optionalArray(value, path, p);
  const ids: string[] = [];
  for (const [i, item] of items.entries()) {
    const id = readMatch(item, at(path, i), p, ID_PATTERN, ID_HINT);
    if (id === null) continue;
    if (ids.includes(id)) {
      p.add(at(path, i), 'duplicate', `${id} is listed twice.`);
      continue;
    }
    ids.push(id);
  }
  return ids;
}

function readKeywords(value: unknown, path: string, p: Problems): string[] {
  const items = optionalArray(value, path, p);
  const words: string[] = [];
  for (const [i, item] of items.entries()) {
    const word = readText(item, at(path, i), p);
    if (word !== null) words.push(word);
  }
  return words;
}

const ID_HINT =
  '2 to 64 characters of lower-case letters, digits, dot, dash or underscore, e.g. "com.lumen.pomodoro".';
const VERSION_HINT = 'Numbers separated by dots, e.g. "1.2.0".';
const TIMESTAMP_HINT = 'An ISO 8601 timestamp, e.g. "2026-09-05T00:00:00Z".';
const SHA256_HINT = 'A sha256 digest: 64 characters of lower-case hex.';
const PATH_HINT = 'A path inside the store, e.g. "payload/com.lumen.pomodoro-1.2.0.json".';

function readTimestamp(value: unknown, path: string, p: Problems): string | null {
  const text = readMatch(value, path, p, TIMESTAMP_PATTERN, TIMESTAMP_HINT);
  if (text === null) return null;
  if (Number.isNaN(Date.parse(text))) {
    p.add(path, 'bad-value', `${TIMESTAMP_HINT} This one names no real moment.`);
    return null;
  }
  return text;
}

export function parseArtwork(value: unknown, path = ''): ParseResult<Artwork> {
  const p = new Problems();
  return completed(readArtwork(value, path, p), p);
}

function readArtwork(value: unknown, path: string, p: Problems): Artwork | null {
  const source = readObject(value, path, p);
  if (source === null) return null;
  const shape = readEnum(source.shape, at(path, 'shape'), p, ARTWORK_SHAPES);
  const tone = readEnum(source.tone, at(path, 'tone'), p, ARTWORK_TONES);
  // The seed only picks a variation between drawings; bounding it keeps the
  // arithmetic that places rings and bars in whole numbers.
  const seed = readInteger(source.seed, at(path, 'seed'), p, { min: 0, max: 1_000_000 });
  if (shape === null || tone === null || seed === null) return null;
  return { shape, seed, tone };
}

function readSummary(value: unknown, path: string, p: Problems): PackageSummary | null {
  const source = readObject(value, path, p);
  if (source === null) return null;
  const id = readMatch(source.id, at(path, 'id'), p, ID_PATTERN, ID_HINT);
  const kind = readEnum(source.kind, at(path, 'kind'), p, PACKAGE_KINDS);
  const name = readText(source.name, at(path, 'name'), p);
  const tagline = readText(source.tagline, at(path, 'tagline'), p);
  const version = readMatch(source.version, at(path, 'version'), p, VERSION_PATTERN, VERSION_HINT);
  const publisher = readText(source.publisher, at(path, 'publisher'), p);
  const category = readText(source.category, at(path, 'category'), p);
  const size = readInteger(source.size, at(path, 'size'), p, { min: 0 });
  const price = readEnum(source.price, at(path, 'price'), p, PACKAGE_PRICES);
  const keywords = readKeywords(source.keywords, at(path, 'keywords'), p);
  const updated = readTimestamp(source.updated, at(path, 'updated'), p);
  if (
    id === null ||
    kind === null ||
    name === null ||
    tagline === null ||
    version === null ||
    publisher === null ||
    category === null ||
    size === null ||
    price === null ||
    updated === null
  ) {
    return null;
  }
  return { id, kind, name, tagline, version, publisher, category, size, price, keywords, updated };
}

function readRequirements(value: unknown, path: string, p: Problems): PackageRequirements {
  if (value === undefined || value === null) return { os: null };
  const source = readObject(value, path, p);
  if (source === null) return { os: null };
  return { os: optionalText(source.os, at(path, 'os'), p) };
}

function readScreenshots(value: unknown, path: string, p: Problems): Artwork[] {
  const items = optionalArray(value, path, p);
  const shots: Artwork[] = [];
  for (const [i, item] of items.entries()) {
    const art = readArtwork(item, at(path, i), p);
    if (art !== null) shots.push(art);
  }
  return shots;
}

/** `index.json`. */
export function parseCatalogue(value: unknown, path = ''): ParseResult<Catalogue> {
  const p = new Problems();
  const source = readObject(value, path, p);
  if (source === null) return { ok: false, problems: p.list };

  const format = readInteger(source.format, at(path, 'format'), p, { min: 1 });
  if (format !== null && format > CATALOGUE_FORMAT) {
    p.add(
      at(path, 'format'),
      'unsupported-format',
      `This store is written in format ${format}; this version of Lumen OS reads format ${CATALOGUE_FORMAT}. Update the system to open it.`,
    );
  }

  const name = readText(source.name, at(path, 'name'), p);
  const updated = readTimestamp(source.updated, at(path, 'updated'), p);

  const packages: PackageSummary[] = [];
  const seenPackages = new Set<string>();
  const packagePath = at(path, 'packages');
  for (const [i, item] of (readArray(source.packages, packagePath, p) ?? []).entries()) {
    const summary = readSummary(item, at(packagePath, i), p);
    if (summary === null) continue;
    if (seenPackages.has(summary.id)) {
      p.add(at(packagePath, i), 'duplicate', `${summary.id} is listed twice.`);
      continue;
    }
    seenPackages.add(summary.id);
    packages.push(summary);
  }

  const sections = readSections(source.sections, at(path, 'sections'), p);
  const collections = readCollections(source.collections, at(path, 'collections'), p);
  const banners = readBanners(source.banners, at(path, 'banners'), p);

  if (format === null || name === null || updated === null || p.failed) {
    return { ok: false, problems: p.list };
  }
  return { ok: true, value: { format, name, updated, packages, sections, banners, collections } };
}

function readSections(value: unknown, path: string, p: Problems): Section[] {
  const items = optionalArray(value, path, p);
  const sections: Section[] = [];
  const seen = new Set<string>();
  for (const [i, item] of items.entries()) {
    const section = readSection(item, at(path, i), p);
    if (section === null) continue;
    if (seen.has(section.id)) {
      p.add(at(path, i), 'duplicate', `${section.id} is listed twice.`);
      continue;
    }
    seen.add(section.id);
    sections.push(section);
  }
  return sections;
}

function readSection(value: unknown, path: string, p: Problems): Section | null {
  const source = readObject(value, path, p);
  if (source === null) return null;
  const id = readMatch(source.id, at(path, 'id'), p, ID_PATTERN, ID_HINT);
  const title = readText(source.title, at(path, 'title'), p);
  const packages = readIdList(source.packages, at(path, 'packages'), p);
  if (id === null || title === null) return null;
  return { id, title, packages };
}

function readCollections(value: unknown, path: string, p: Problems): Collection[] {
  const items = optionalArray(value, path, p);
  const collections: Collection[] = [];
  const seen = new Set<string>();
  for (const [i, item] of items.entries()) {
    const itemPath = at(path, i);
    const section = readSection(item, itemPath, p);
    const source = isRecord(item) ? item : null;
    if (section === null || source === null) continue;
    const tagline = readText(source.tagline, at(itemPath, 'tagline'), p);
    const artwork = readArtwork(source.artwork, at(itemPath, 'artwork'), p);
    if (tagline === null || artwork === null) continue;
    if (seen.has(section.id)) {
      p.add(itemPath, 'duplicate', `${section.id} is listed twice.`);
      continue;
    }
    seen.add(section.id);
    collections.push({ ...section, tagline, artwork });
  }
  return collections;
}

function readBanners(value: unknown, path: string, p: Problems): Banner[] {
  const items = optionalArray(value, path, p);
  const banners: Banner[] = [];
  const seen = new Set<string>();
  for (const [i, item] of items.entries()) {
    const banner = readBanner(item, at(path, i), p);
    if (banner === null) continue;
    if (seen.has(banner.id)) {
      p.add(at(path, i), 'duplicate', `${banner.id} is listed twice.`);
      continue;
    }
    seen.add(banner.id);
    banners.push(banner);
  }
  return banners;
}

/** `banner/<id>.json`, and each entry of `index.json`'s `banners`. */
export function parseBanner(value: unknown, path = ''): ParseResult<Banner> {
  const p = new Problems();
  return completed(readBanner(value, path, p), p);
}

function readBanner(value: unknown, path: string, p: Problems): Banner | null {
  const source = readObject(value, path, p);
  if (source === null) return null;
  const id = readMatch(source.id, at(path, 'id'), p, ID_PATTERN, ID_HINT);
  const title = readText(source.title, at(path, 'title'), p);
  const text = readText(source.text, at(path, 'text'), p);
  const target = readTarget(source.target, at(path, 'target'), p);
  const artwork = readArtwork(source.artwork, at(path, 'artwork'), p);
  if (id === null || title === null || text === null || target === null || artwork === null) {
    return null;
  }
  return { id, title, text, target, artwork };
}

function readTarget(value: unknown, path: string, p: Problems): BannerTarget | null {
  const source = readObject(value, path, p);
  if (source === null) return null;
  const kind = readEnum(source.kind, at(path, 'kind'), p, BANNER_TARGET_KINDS);
  const id = readMatch(source.id, at(path, 'id'), p, ID_PATTERN, ID_HINT);
  if (kind === null || id === null) return null;
  return { kind, id };
}

/** `packages/<id>.json`. */
export function parsePackage(value: unknown, path = ''): ParseResult<PackageDocument> {
  const p = new Problems();
  const source = readObject(value, path, p);
  if (source === null) return { ok: false, problems: p.list };

  const summary = readSummary(source, path, p);
  const description = readText(source.description, at(path, 'description'), p);
  const requires = readRequirements(source.requires, at(path, 'requires'), p);
  const capabilities = readKeywords(source.capabilities, at(path, 'capabilities'), p);
  const screenshots = readScreenshots(source.screenshots, at(path, 'screenshots'), p);
  const releaseNotes = optionalText(source.releaseNotes, at(path, 'releaseNotes'), p);

  if (summary === null || description === null) return { ok: false, problems: p.list };
  const common = { ...summary, description, requires, capabilities, screenshots, releaseNotes };

  if (summary.kind === 'bundle') {
    return completed<PackageDocument>(readBundle(common, source, path, p), p);
  }
  return completed<PackageDocument>(readPayloadPackage(common, summary.kind, source, path, p), p);
}

type PackageCommonFields = Omit<PayloadPackage, 'kind' | 'payload' | 'sha256'>;

function readBundle(
  common: PackageCommonFields,
  source: Record<string, unknown>,
  path: string,
  p: Problems,
): BundlePackage | null {
  // A bundle has nothing of its own to download. A payload here would be a
  // file the client never fetches and never checks, so the document is wrong
  // about itself and is refused rather than half-obeyed.
  for (const key of ['payload', 'sha256'] as const) {
    if (source[key] !== undefined) {
      p.add(at(path, key), 'inconsistent', 'A bundle has no payload; it lists members instead.');
    }
  }
  if (common.size !== 0) {
    p.add(at(path, 'size'), 'inconsistent', 'A bundle downloads nothing of its own; size is 0.');
  }
  const members = readIdList(source.members, at(path, 'members'), p);
  if (members.length === 0) {
    p.add(at(path, 'members'), 'missing', 'A bundle names the packages it installs.');
  }
  if (members.includes(common.id)) {
    p.add(at(path, 'members'), 'inconsistent', `A bundle cannot contain itself (${common.id}).`);
  }
  if (p.failed) return null;
  return { ...common, kind: 'bundle', members };
}

function readPayloadPackage(
  common: PackageCommonFields,
  kind: PayloadKind,
  source: Record<string, unknown>,
  path: string,
  p: Problems,
): PayloadPackage | null {
  const payload = readMatch(source.payload, at(path, 'payload'), p, STORE_PATH, PATH_HINT);
  const sha256 = readMatch(source.sha256, at(path, 'sha256'), p, SHA256_PATTERN, SHA256_HINT);
  if (source.members !== undefined) {
    p.add(at(path, 'members'), 'inconsistent', 'Only a bundle has members.');
  }
  if (payload === null || sha256 === null || p.failed) return null;
  return { ...common, kind, payload, sha256 };
}

/**
 * `payload/<id>-<version>.json`. The document says nothing about its own kind,
 * so the kind comes from the package that named it.
 */
export function parsePayload(kind: PayloadKind, value: unknown): ParseResult<PayloadDocument> {
  const p = new Problems();
  if (kind === 'app') {
    const manifest = readAppPayload(value, p);
    return completed<PayloadDocument>(manifest === null ? null : { kind, manifest }, p);
  }
  if (kind === 'font') {
    const font = readFontPayload(value, p);
    return completed<PayloadDocument>(font === null ? null : { kind, font }, p);
  }
  const icons = readIconsPayload(value, p);
  return completed<PayloadDocument>(icons === null ? null : { kind, icons }, p);
}

/**
 * The app payload is an `AppManifest`, so it is read by the same code that
 * reads a `.app` file a person drops on the desktop: whatever that accepts,
 * `Kernel.parseManifest` accepts too.
 */
function readAppPayload(value: unknown, p: Problems): AppManifest | null {
  const report = validateManifest(value);
  for (const issue of errorsOf(report.issues)) {
    p.add(issue.field, 'bad-value', issue.message);
  }
  return report.manifest;
}

function readFontPayload(value: unknown, p: Problems): FontResource | null {
  const source = readObject(value, '', p);
  if (source === null) return null;
  const family = readText(source.family, 'family', p);
  const items = readArray(source.faces, 'faces', p) ?? [];
  if (items.length === 0) p.add('faces', 'missing', 'A font needs at least one face.');
  const faces: FontFace[] = [];
  for (const [i, item] of items.entries()) {
    const face = readFontFace(item, at('faces', i), p);
    if (face !== null) faces.push(face);
  }
  if (family === null || p.failed) return null;
  return { family, faces };
}

function readFontFace(value: unknown, path: string, p: Problems): FontFace | null {
  const source = readObject(value, path, p);
  if (source === null) return null;
  const weight = readInteger(source.weight, at(path, 'weight'), p, FONT_WEIGHT);
  const style = readEnum(source.style, at(path, 'style'), p, ['normal', 'italic'] as const);
  const src = readString(source.src, at(path, 'src'), p);
  if (src !== null && !/^data:/i.test(src)) {
    // FORMAT.md requires a data: URL so that installing a font makes no second
    // request; a remote src would let the store watch who is using it.
    p.add(at(path, 'src'), 'bad-value', 'Must be a data: URL. A font makes no second request.');
    return null;
  }
  if (weight === null || style === null || src === null) return null;
  return { weight, style, src };
}

function readIconsPayload(value: unknown, p: Problems): IconsResource | null {
  const source = readObject(value, '', p);
  if (source === null) return null;
  const prefix = readMatch(
    source.prefix,
    'prefix',
    p,
    /^[a-z0-9][a-z0-9-]{0,31}$/i,
    'Lower-case letters, digits and dashes, e.g. "weather".',
  );
  const table = readObject(source.icons, 'icons', p);
  if (table === null) return null;
  const entries: Array<[string, string]> = [];
  for (const [name, data] of Object.entries(table)) {
    const path = at('icons', name);
    if (name === '__proto__') {
      // Assigning this key by name would reach the prototype rather than the
      // object; refusing it is cheaper than depending on how it is copied.
      p.add(path, 'bad-value', 'Not a usable icon name.');
      continue;
    }
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/i.test(name)) {
      p.add(path, 'bad-value', 'Icon names are letters, digits and dashes.');
      continue;
    }
    const d = readString(data, path, p);
    if (d === null) continue;
    if (d.trim().length === 0) {
      p.add(path, 'bad-value', 'Empty path data.');
      continue;
    }
    if (!SVG_PATH_DATA.test(d)) {
      p.add(path, 'bad-value', 'Must be SVG path data: commands, numbers and separators only.');
      continue;
    }
    entries.push([name, d]);
  }
  if (entries.length === 0) p.add('icons', 'missing', 'An icon set needs at least one icon.');
  if (prefix === null || p.failed) return null;
  // Built by fromEntries, which defines properties rather than assigning them.
  return { prefix, icons: Object.fromEntries(entries) };
}

/** JSON that failed to parse is one problem, not an exception. */
export function parseJson(text: string, path = ''): ParseResult<unknown> {
  if (text.trim().length === 0) {
    return { ok: false, problems: [{ path, code: 'json', message: 'The document is empty.' }] };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, problems: [{ path, code: 'json', message: `Not valid JSON: ${detail}` }] };
  }
}

function fromText<T>(text: string, parse: (value: unknown) => ParseResult<T>): ParseResult<T> {
  const json = parseJson(text);
  return json.ok ? parse(json.value) : json;
}

export function parseCatalogueText(text: string): ParseResult<Catalogue> {
  return fromText(text, (value) => parseCatalogue(value));
}

export function parsePackageText(text: string): ParseResult<PackageDocument> {
  return fromText(text, (value) => parsePackage(value));
}

export function parseBannerText(text: string): ParseResult<Banner> {
  return fromText(text, (value) => parseBanner(value));
}

export function parsePayloadText(kind: PayloadKind, text: string): ParseResult<PayloadDocument> {
  return fromText(text, (value) => parsePayload(kind, value));
}

/** True when the only thing wrong is that the store is newer than this client. */
export function isUnsupportedFormat(problems: readonly ParseProblem[]): boolean {
  return problems.some((problem) => problem.code === 'unsupported-format');
}

/** One line for the storefront: the first problems, with their fields. */
export function describeProblems(problems: readonly ParseProblem[], limit = 3): string {
  if (problems.length === 0) return '';
  const shown = problems
    .slice(0, limit)
    .map((problem) =>
      problem.path.length === 0 ? problem.message : `${problem.path}: ${problem.message}`,
    )
    .join(' ');
  const rest = problems.length - Math.min(limit, problems.length);
  return rest > 0 ? `${shown} And ${rest} more.` : shown;
}

/** The identifier rule from `store/FORMAT.md`, for a caller building a URL. */
export function isPackageId(value: string): boolean {
  return ID_PATTERN.test(value);
}

/** The kinds that carry a payload, for a caller holding a `PackageKind`. */
export function isPayloadKind(kind: PackageKind): kind is PayloadKind {
  return kind !== 'bundle';
}
