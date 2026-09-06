/**
 * Reading a `.app` manifest before the OS installs it.
 *
 * `Kernel.parseManifest` throws on the first problem, which is right for the
 * boot path and useless for a person holding a file that does not work. This
 * module reads the same shape (`AppManifest` in @lumen/kernel) and returns
 * every problem it found at once, split into errors (the OS would refuse or
 * misread the file) and warnings (the OS installs it, but something in the
 * file will be ignored), plus the plain-language list of what the manifest is
 * asking to be allowed to do.
 *
 * Anything this module accepts, `Kernel.parseManifest` also accepts.
 */

import type {
  AppCategory,
  AppManifest,
  LaunchArgs,
  TitleBarStyle,
  WindowOptions,
} from '@lumen/kernel';

export type IssueLevel = 'error' | 'warning';

export interface ManifestIssue {
  level: IssueLevel;
  /** Dotted path of the field, or '' for the document as a whole. */
  field: string;
  message: string;
}

export interface ManifestCapability {
  id: string;
  /** One sentence, in the second person's terms: what the program may do. */
  label: string;
}

export interface ManifestReport {
  /** The manifest the OS would install; null when there is an error. */
  manifest: AppManifest | null;
  issues: ManifestIssue[];
  capabilities: ManifestCapability[];
}

export interface ValidateOptions {
  /** Ids the kernel has registered, so an alias pointing nowhere is caught. */
  knownAppIds?: readonly string[];
}

/** Same rule as `Kernel.parseManifest`. */
const ID_PATTERN = /^[a-z0-9_.-]{2,64}$/i;
/** Characters `Kernel.installApp` strips out of the file name. */
const UNSAFE_NAME_CHARS = /[\\/:*?"<>|]/g;
const VERSION_PATTERN = /^\d+(\.\d+){0,3}(-[0-9a-z.-]+)?$/i;
const REMOTE_URL = /\bhttps?:\/\/[^\s"'<>]+/i;

export const MANIFEST_FIELDS = [
  'id',
  'name',
  'description',
  'version',
  'icon',
  'alias',
  'html',
  'script',
  'window',
  'category',
  'keywords',
] as const;

export const CATEGORIES: readonly AppCategory[] = [
  'system',
  'utilities',
  'office',
  'media',
  'internet',
  'developer',
  'games',
  'user',
];

const TITLE_BARS: readonly TitleBarStyle[] = ['default', 'inset', 'hidden'];

const WINDOW_NUMBERS = [
  'width',
  'height',
  'minWidth',
  'minHeight',
  'maxWidth',
  'maxHeight',
  'x',
  'y',
] as const;

const WINDOW_FLAGS = [
  'resizable',
  'maximizable',
  'minimizable',
  'closable',
  'centered',
  'alwaysOnTop',
  'showIcon',
] as const;

const WINDOW_FIELDS: readonly string[] = [...WINDOW_NUMBERS, ...WINDOW_FLAGS, 'titleBar', 'title'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function typeName(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  const t = typeof value;
  if (t === 'object') return 'an object';
  if (t === 'number') return 'a number';
  if (t === 'boolean') return 'a boolean';
  if (t === 'string') return 'a string';
  return t;
}

class Issues {
  readonly list: ManifestIssue[] = [];

  error(field: string, message: string): void {
    this.list.push({ level: 'error', field, message });
  }

  warn(field: string, message: string): void {
    this.list.push({ level: 'warning', field, message });
  }
}

export function errorsOf(issues: readonly ManifestIssue[]): ManifestIssue[] {
  return issues.filter((i) => i.level === 'error');
}

export function warningsOf(issues: readonly ManifestIssue[]): ManifestIssue[] {
  return issues.filter((i) => i.level === 'warning');
}

/** Read manifest JSON. Malformed JSON is one error, not an exception. */
export function parseManifestText(text: string, options: ValidateOptions = {}): ManifestReport {
  if (text.trim().length === 0) {
    return {
      manifest: null,
      issues: [{ level: 'error', field: '', message: 'There is nothing to read.' }],
      capabilities: [],
    };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return {
      manifest: null,
      issues: [
        {
          level: 'error',
          field: '',
          message: `Not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
        },
      ],
      capabilities: [],
    };
  }
  return validateManifest(value, options);
}

/** Check a parsed value against the `AppManifest` contract. */
export function validateManifest(value: unknown, options: ValidateOptions = {}): ManifestReport {
  const issues = new Issues();
  if (!isRecord(value)) {
    issues.error('', `A manifest is a JSON object; this is ${typeName(value)}.`);
    return { manifest: null, issues: issues.list, capabilities: [] };
  }

  for (const key of Object.keys(value)) {
    if (!(MANIFEST_FIELDS as readonly string[]).includes(key)) {
      issues.warn(key, 'Unknown field. It is dropped when the app is installed.');
    }
  }

  const draft: Partial<AppManifest> = {};
  readId(value.id, issues, draft);
  readName(value.name, issues, draft);
  readText(value, 'description', issues, draft);
  readVersion(value.version, issues, draft);
  readIcon(value.icon, issues, draft);
  readEntryPoints(value, issues, draft, options);
  readWindow(value.window, issues, draft);
  readCategory(value.category, issues, draft);
  readKeywords(value.keywords, issues, draft);

  const capabilities = describeCapabilities(draft);
  const failed = errorsOf(issues.list).length > 0;
  return {
    manifest: failed ? null : (draft as AppManifest),
    issues: issues.list,
    capabilities,
  };
}

function readId(value: unknown, issues: Issues, draft: Partial<AppManifest>): void {
  if (value === undefined) {
    issues.error('id', 'Required. Give the app an identifier, e.g. "user.notepad".');
    return;
  }
  if (typeof value !== 'string') {
    issues.error('id', `Must be a string; this is ${typeName(value)}.`);
    return;
  }
  if (!ID_PATTERN.test(value)) {
    issues.error(
      'id',
      '2 to 64 characters, letters, digits, dot, dash or underscore. Nothing else.',
    );
    return;
  }
  if (!value.includes('.')) {
    issues.warn('id', 'Identifiers usually read like "user.notepad" so they cannot collide.');
  }
  draft.id = value;
}

function readName(value: unknown, issues: Issues, draft: Partial<AppManifest>): void {
  if (value === undefined) {
    issues.error('name', 'Required. This is the name shown in the Start menu.');
    return;
  }
  if (typeof value !== 'string') {
    issues.error('name', `Must be a string; this is ${typeName(value)}.`);
    return;
  }
  if (value.trim().length === 0) {
    issues.error('name', 'Required. This is the name shown in the Start menu.');
    return;
  }
  if (value.replace(UNSAFE_NAME_CHARS, '').trim().length === 0) {
    issues.error('name', 'The name must keep one character that a file name can hold.');
    return;
  }
  draft.name = value;
}

function readText(
  source: Record<string, unknown>,
  field: 'description',
  issues: Issues,
  draft: Partial<AppManifest>,
): void {
  const value = source[field];
  if (value === undefined) return;
  if (typeof value !== 'string') {
    issues.error(field, `Must be a string; this is ${typeName(value)}.`);
    return;
  }
  draft[field] = value;
}

function readVersion(value: unknown, issues: Issues, draft: Partial<AppManifest>): void {
  if (value === undefined) return;
  if (typeof value !== 'string') {
    issues.error('version', `Must be a string; this is ${typeName(value)}.`);
    return;
  }
  if (!VERSION_PATTERN.test(value.trim())) {
    issues.warn('version', 'Versions read as numbers separated by dots, e.g. "1.2" or "1.2.0".');
  }
  draft.version = value;
}

function readIcon(value: unknown, issues: Issues, draft: Partial<AppManifest>): void {
  if (value === undefined) return;
  if (typeof value !== 'string') {
    issues.error('icon', `Must be a string; this is ${typeName(value)}.`);
    return;
  }
  if (!value.startsWith('data:')) {
    issues.warn('icon', 'Only a data: URL is drawn. Other values fall back to the initial letter.');
  }
  draft.icon = value;
}

function readEntryPoints(
  source: Record<string, unknown>,
  issues: Issues,
  draft: Partial<AppManifest>,
  options: ValidateOptions,
): void {
  const declared = (['alias', 'html', 'script'] as const).filter(
    (k) => source[k] !== undefined && source[k] !== null,
  );
  if (declared.length === 0) {
    issues.error('', 'A manifest needs one of "alias", "html" or "script": something to run.');
  }
  if (declared.length > 1) {
    issues.warn(
      '',
      `Only one of ${declared.join(', ')} runs. The OS tries alias, then script, then html.`,
    );
  }

  readAlias(source.alias, issues, draft, options);
  readSource(source, 'html', issues, draft);
  readSource(source, 'script', issues, draft);

  if (typeof draft.html === 'string' && REMOTE_URL.test(draft.html)) {
    const url = draft.html.match(REMOTE_URL)?.[0] ?? '';
    issues.warn('html', `Loads ${url} from the network when it runs.`);
  }
}

function readAlias(
  value: unknown,
  issues: Issues,
  draft: Partial<AppManifest>,
  options: ValidateOptions,
): void {
  if (value === undefined || value === null) return;
  if (!isRecord(value)) {
    issues.error(
      'alias',
      `Must be an object like { "appId": "lumen.editor" }; this is ${typeName(value)}.`,
    );
    return;
  }
  const appId = value.appId;
  if (typeof appId !== 'string' || appId.trim().length === 0) {
    issues.error('alias.appId', 'Required. The id of the built-in app to launch.');
    return;
  }
  const known = options.knownAppIds;
  if (known && !known.includes(appId)) {
    issues.warn('alias.appId', `No app with the id ${appId} is registered on this system.`);
  }
  const alias: { appId: string; args?: LaunchArgs } = { appId };
  if (value.args !== undefined) {
    if (!isRecord(value.args)) {
      issues.error('alias.args', `Must be an object; this is ${typeName(value.args)}.`);
      return;
    }
    alias.args = value.args as LaunchArgs;
  }
  draft.alias = alias;
}

function readSource(
  source: Record<string, unknown>,
  field: 'html' | 'script',
  issues: Issues,
  draft: Partial<AppManifest>,
): void {
  const value = source[field];
  if (value === undefined || value === null) return;
  if (typeof value !== 'string') {
    issues.error(field, `Must be a string; this is ${typeName(value)}.`);
    return;
  }
  if (value.trim().length === 0) {
    issues.error(field, 'Empty. There would be nothing to run.');
    return;
  }
  draft[field] = value;
}

function readWindow(value: unknown, issues: Issues, draft: Partial<AppManifest>): void {
  if (value === undefined) return;
  if (!isRecord(value)) {
    issues.error('window', `Must be an object of window defaults; this is ${typeName(value)}.`);
    return;
  }
  const window: Partial<WindowOptions> = {};
  for (const key of Object.keys(value)) {
    if (!WINDOW_FIELDS.includes(key)) {
      issues.warn(
        `window.${key}`,
        'Unknown window option. It is dropped when the app is installed.',
      );
    }
  }
  for (const key of WINDOW_NUMBERS) {
    const n = value[key];
    if (n === undefined) continue;
    if (typeof n !== 'number' || !Number.isFinite(n)) {
      issues.error(`window.${key}`, `Must be a number; this is ${typeName(n)}.`);
      continue;
    }
    if (key !== 'x' && key !== 'y' && n <= 0) {
      issues.error(`window.${key}`, 'Must be greater than zero.');
      continue;
    }
    window[key] = n;
  }
  for (const key of WINDOW_FLAGS) {
    const b = value[key];
    if (b === undefined) continue;
    if (typeof b !== 'boolean') {
      issues.error(`window.${key}`, `Must be true or false; this is ${typeName(b)}.`);
      continue;
    }
    window[key] = b;
  }
  if (value.titleBar !== undefined) {
    if (
      typeof value.titleBar !== 'string' ||
      !TITLE_BARS.includes(value.titleBar as TitleBarStyle)
    ) {
      issues.error('window.titleBar', `Must be one of ${TITLE_BARS.join(', ')}.`);
    } else {
      window.titleBar = value.titleBar as TitleBarStyle;
    }
  }
  if (value.title !== undefined) {
    if (typeof value.title !== 'string') {
      issues.error('window.title', `Must be a string; this is ${typeName(value.title)}.`);
    } else {
      window.title = value.title;
    }
  }
  const { width, height, minWidth, minHeight } = window;
  if (width !== undefined && minWidth !== undefined && width < minWidth) {
    issues.warn('window.width', 'Narrower than minWidth; the window opens at minWidth.');
  }
  if (height !== undefined && minHeight !== undefined && height < minHeight) {
    issues.warn('window.height', 'Shorter than minHeight; the window opens at minHeight.');
  }
  draft.window = window;
}

function readCategory(value: unknown, issues: Issues, draft: Partial<AppManifest>): void {
  if (value === undefined) return;
  if (typeof value !== 'string') {
    issues.error('category', `Must be a string; this is ${typeName(value)}.`);
    return;
  }
  if (!CATEGORIES.includes(value as AppCategory)) {
    issues.error('category', `Must be one of ${CATEGORIES.join(', ')}.`);
    return;
  }
  draft.category = value as AppCategory;
}

function readKeywords(value: unknown, issues: Issues, draft: Partial<AppManifest>): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    issues.error('keywords', `Must be an array of strings; this is ${typeName(value)}.`);
    return;
  }
  const words: string[] = [];
  let bad = false;
  for (const [index, word] of value.entries()) {
    if (typeof word !== 'string') {
      issues.error(`keywords[${index}]`, `Must be a string; this is ${typeName(word)}.`);
      bad = true;
      continue;
    }
    words.push(word);
  }
  if (!bad) draft.keywords = words;
}

/**
 * What installing this manifest lets it do, said plainly. Derived from the
 * fields alone, so it is true of the file in front of the reader.
 */
export function describeCapabilities(manifest: Partial<AppManifest>): ManifestCapability[] {
  const out: ManifestCapability[] = [];
  if (manifest.alias) {
    out.push({
      id: 'alias',
      label: `Launches the built-in app ${manifest.alias.appId}.`,
    });
    const path = manifest.alias.args?.path;
    if (typeof path === 'string') {
      out.push({ id: 'alias.path', label: `Opens ${path} when it starts.` });
    }
  }
  if (manifest.script) {
    out.push({
      id: 'script',
      label: 'Runs a shell script in a Terminal window, with your files in reach.',
    });
  }
  if (manifest.html) {
    out.push({ id: 'html', label: 'Runs HTML in a sandboxed frame: no access to your files.' });
    out.push({
      id: 'html.bridge',
      label: `Can set its window title, post notifications, and save data in .appdata/${manifest.id ?? 'its id'}.json.`,
    });
  }
  if (out.length > 0) {
    out.push({ id: 'listing', label: 'Appears in the Start menu, search, and /Applications.' });
  }
  return out;
}

/** The JSON the OS stores, formatted the way `Kernel.installApp` writes it. */
export function formatManifest(manifest: AppManifest): string {
  return JSON.stringify(manifest, null, 2);
}
