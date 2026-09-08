/**
 * The .lwr file format, the importers for the formats Writer can open, and
 * the exporters. All of it is pure: read a string, return a string.
 */
import { basename, extname } from '@lumen/vfs';
import { escapeHtml, parseBody } from './dom';
import { htmlToMarkdown } from './markdown';
import { EMPTY_DOCUMENT, sanitizeDocument } from './sanitize';
import { htmlToPlainText } from './stats';

export const WRITER_EXTENSION = '.lwr';
export const LWR_VERSION = 1;

/** Offered by the Open dialog. */
export const OPEN_EXTENSIONS = ['.lwr', '.html', '.htm', '.rtf', '.txt', '.md'];
/** Offered by Save As; .rtf is import-only. */
export const SAVE_EXTENSIONS = ['.lwr', '.html', '.htm', '.md', '.txt'];

export interface WriterFile {
  version: number;
  html: string;
  title?: string;
}

export type DocumentKind = 'writer' | 'html' | 'rtf' | 'markdown' | 'text';

export function documentKind(path: string): DocumentKind {
  switch (extname(path).toLowerCase()) {
    case '.lwr':
      return 'writer';
    case '.html':
    case '.htm':
      return 'html';
    case '.rtf':
      return 'rtf';
    case '.md':
    case '.markdown':
      return 'markdown';
    default:
      return 'text';
  }
}

export interface OpenedDocument {
  html: string;
  title: string | null;
  /** RTF is imported as text only, so the editor stays locked until Save As. */
  readOnly: boolean;
}

/** Turn the bytes of a supported file into editor HTML. */
export function openDocument(path: string, raw: string): OpenedDocument {
  switch (documentKind(path)) {
    case 'writer': {
      const file = parseWriterFile(raw);
      return { html: file.html, title: file.title, readOnly: false };
    }
    case 'html':
      return { html: sanitizeDocument(raw), title: htmlTitle(raw), readOnly: false };
    case 'rtf':
      return { html: textToHtml(rtfToText(raw)), title: null, readOnly: true };
    default:
      return { html: textToHtml(raw), title: null, readOnly: false };
  }
}

export function parseWriterFile(raw: string): { html: string; title: string | null } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('This file is not a Writer document.');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('This file is not a Writer document.');
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.html !== 'string') {
    throw new Error('This Writer document has no content.');
  }
  return {
    html: sanitizeDocument(record.html),
    title: typeof record.title === 'string' ? record.title : null,
  };
}

export function serializeWriterFile(html: string, title: string | null): string {
  const file: WriterFile = { version: LWR_VERSION, html };
  if (title !== null && title !== '') file.title = title;
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** What Save writes for a given path, chosen by extension. */
export function serializeFor(path: string, html: string, title: string): string {
  switch (documentKind(path)) {
    case 'html':
      return exportHtmlDocument(html, title);
    case 'markdown':
      return htmlToMarkdown(html);
    case 'text':
    case 'rtf':
      return `${htmlToPlainText(html)}\n`;
    default:
      return serializeWriterFile(html, title);
  }
}

/** Deliberately small: a served document should look like the editor's page. */
const EXPORT_CSS = [
  'body{margin:0;padding:48px 24px;background:#fff;color:#141517;',
  "font-family:'IBM Plex Sans',system-ui,sans-serif;font-size:15px;line-height:1.6}",
  'article{max-width:720px;margin:0 auto}',
  'h1{font-size:28px;line-height:1.2;margin:1.5em 0 .5em;font-weight:600}',
  'h2{font-size:20px;line-height:1.3;margin:1.4em 0 .5em;font-weight:600}',
  'h3{font-size:16px;line-height:1.4;margin:1.3em 0 .5em;font-weight:600}',
  'p{margin:0 0 .75em}ul,ol{margin:0 0 .75em;padding-left:1.5em}',
  'blockquote{margin:1em 0;padding-left:1em;border-left:2px solid #d8d8dc;color:#5b5e66}',
  // deslop-ignore-next-line 34 — mono is the code block of the exported document
  "pre,code{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:13px}",
  'pre{background:#f2f2f4;border-radius:5px;padding:12px 14px;white-space:pre-wrap}',
  'code{background:#f2f2f4;border-radius:3px;padding:1px 4px}',
  'pre code{background:none;padding:0}',
  'a{color:#2f6fd6}hr{border:0;border-top:1px solid #d8d8dc;margin:1.5em 0}',
].join('');

export function exportHtmlDocument(html: string, title: string): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${EXPORT_CSS}</style>`,
    '</head>',
    '<body>',
    '<article>',
    html,
    '</article>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

/** Plain text becomes one paragraph per line, so the caret behaves normally. */
export function textToHtml(text: string): string {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const html = lines
    .map((line) => (line.trim() === '' ? EMPTY_DOCUMENT : `<p>${escapeHtml(line)}</p>`))
    .join('');
  return html === '' ? EMPTY_DOCUMENT : html;
}

export function htmlTitle(raw: string): string | null {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw);
  const title = match?.[1]?.replace(/\s+/g, ' ').trim();
  return title === undefined || title === '' ? null : title;
}

/** True when the document holds nothing but empty markup. */
export function isEmptyDocument(html: string): boolean {
  if (/<(hr|img)\b/i.test(html)) return false;
  // Read the text through the parser rather than by stripping tags with a
  // regular expression. `<[^>]*>` leaves an unterminated `<script` behind, and
  // although this predicate only ever compares its result to the empty string,
  // a tag-stripping regex sitting in a file next to the sanitiser is an
  // invitation to reuse it where the output does reach the DOM.
  const text = (parseBody(html).textContent ?? '').split(String.fromCharCode(160)).join(' ');
  return text.trim() === '';
}

/** The document's name without its extension: the window title and export stem. */
export function documentTitle(path: string | null): string {
  if (path === null) return 'Untitled';
  const name = basename(path);
  return name.replace(/\.[^./]+$/, '') || name;
}

export function suggestedName(path: string | null, extension: string): string {
  return `${documentTitle(path)}${extension}`;
}

/** RTF control words that carry a literal character. */
const LITERALS: Record<string, string> = {
  par: '\n',
  line: '\n',
  sect: '\n',
  page: '\n',
  tab: '\t',
  emdash: String.fromCharCode(8212),
  endash: String.fromCharCode(8211),
  lquote: String.fromCharCode(8216),
  rquote: String.fromCharCode(8217),
  ldblquote: String.fromCharCode(8220),
  rdblquote: String.fromCharCode(8221),
  bullet: String.fromCharCode(8226),
};

/** Groups whose contents are metadata, not document text. */
const IGNORED_GROUPS = new Set([
  'colorschememapping',
  'colortbl',
  'datastore',
  'filetbl',
  'fldinst',
  'fonttbl',
  'generator',
  'info',
  'latentstyles',
  'listoverridetable',
  'listtable',
  'mmathpr',
  'object',
  'panose',
  'pict',
  'rsidtbl',
  'stylesheet',
  'themedata',
  'xmlnstbl',
]);

const CONTROL_WORD = /^\\([a-zA-Z]+)(-?\d+)? ?/;

/**
 * Strip RTF down to its text. Best effort: control words are dropped, the
 * groups that hold tables and metadata are skipped, and escapes become
 * characters. Formatting is not preserved.
 */
export function rtfToText(input: string): string {
  if (!/^\s*\{\\rtf/.test(input)) return input;
  const out: string[] = [];
  const stack: boolean[] = [];
  let ignore = false;
  let skip = 0;
  let i = 0;
  const emit = (text: string) => {
    if (!ignore) out.push(text);
  };
  while (i < input.length) {
    const ch = input[i] ?? '';
    if (ch === '{') {
      stack.push(ignore);
      i += 1;
    } else if (ch === '}') {
      ignore = stack.pop() ?? false;
      i += 1;
    } else if (ch === '\\') {
      i += readControl(input, i, emit, {
        setIgnore: (value) => {
          ignore = value;
        },
        setSkip: (value) => {
          skip = value;
        },
      });
    } else if (ch === '\n' || ch === '\r') {
      i += 1;
    } else if (skip > 0) {
      skip -= 1;
      i += 1;
    } else {
      emit(ch);
      i += 1;
    }
  }
  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface ControlSink {
  setIgnore: (value: boolean) => void;
  setSkip: (value: number) => void;
}

/** Consume one backslash escape or control word; returns how many characters. */
function readControl(
  input: string,
  at: number,
  emit: (t: string) => void,
  sink: ControlSink,
): number {
  const next = input[at + 1] ?? '';
  if (next === '\\' || next === '{' || next === '}') {
    emit(next);
    return 2;
  }
  if (next === "'") {
    const code = Number.parseInt(input.slice(at + 2, at + 4), 16);
    if (Number.isFinite(code)) emit(String.fromCharCode(code));
    return 4;
  }
  if (next === '*') {
    sink.setIgnore(true);
    return 2;
  }
  if (next === '\n' || next === '\r') {
    emit('\n');
    return 2;
  }
  if (next === '~') {
    emit(' ');
    return 2;
  }
  if (next === '-' || next === '_') return 2;
  const match = CONTROL_WORD.exec(input.slice(at));
  if (match === null) return 1;
  const word = (match[1] ?? '').toLowerCase();
  const param = match[2];
  if (IGNORED_GROUPS.has(word)) {
    sink.setIgnore(true);
    return match[0].length;
  }
  if (word === 'u' && param !== undefined) {
    const code = Number(param);
    emit(String.fromCodePoint(code < 0 ? code + 65536 : code));
    sink.setSkip(1);
    return match[0].length;
  }
  const literal = LITERALS[word];
  if (literal !== undefined) emit(literal);
  return match[0].length;
}
