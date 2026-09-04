/**
 * The Markdown reader behind the preview pane.
 *
 * The source is parsed into a data tree and that tree is rendered with
 * `createElement`, so no path exists from the document to markup: raw HTML in
 * a note is shown as text, links are limited to a small scheme list, images
 * are dropped. Every block carries the source line it started on, which is
 * what lets a checkbox in the preview rewrite its own line in the file.
 */
import { createElement, type ReactNode } from 'react';

export type MarkdownInline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; children: MarkdownInline[] }
  | { type: 'emphasis'; children: MarkdownInline[] }
  | { type: 'strike'; children: MarkdownInline[] }
  | { type: 'link'; href: string; children: MarkdownInline[] };

export type CellAlign = 'left' | 'center' | 'right' | null;

export interface ListItem {
  blocks: MarkdownBlock[];
  /** Source line of the bullet, so `- [ ]` can be rewritten in place. */
  line: number;
  /** `null` when the item is not a task. */
  checked: boolean | null;
}

export type MarkdownBlock =
  | { type: 'heading'; level: number; children: MarkdownInline[]; line: number }
  | { type: 'paragraph'; children: MarkdownInline[]; line: number }
  | { type: 'code'; language: string | null; value: string; line: number }
  | { type: 'quote'; children: MarkdownBlock[]; line: number }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[]; line: number }
  | { type: 'rule'; line: number }
  | {
      type: 'table';
      align: CellAlign[];
      header: MarkdownInline[][];
      rows: MarkdownInline[][][];
      line: number;
    };

/** A source line paired with its index in the file, kept through nesting. */
interface Line {
  text: string;
  line: number;
}

const FENCE = /^ {0,3}(```+|~~~+)[ \t]*([^`]*)$/;
const RULE = /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const QUOTE = /^ {0,3}>[ \t]?/;
const BULLET = /^([ \t]*)([-*+]|(\d{1,9})[.)])([ \t]+)(.*)$/;
const TASK = /^\[([ xX])\](?:[ \t]+(.*))?$/;
const TABLE_DELIMITER = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
/** Rewriting a task marker: prefix, state, closing bracket. */
const TASK_LINE = /^([ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+\[)([ xX])(\])/;

/** Only these schemes reach an href; everything else renders as plain text. */
export const SAFE_SCHEMES = ['http://', 'https://', 'mailto:'] as const;

export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  // Control characters and spaces can hide a scheme ("java\nscript:"); reject them.
  for (let i = 0; i < href.length; i++) {
    const code = href.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return null;
  }
  const lower = href.toLowerCase();
  return SAFE_SCHEMES.some((scheme) => lower.startsWith(scheme)) ? href : null;
}

/**
 * Parse a document. `lineOffset` is the line the source starts on in the file,
 * so a body taken from under front matter still reports file line numbers.
 */
export function parseMarkdown(source: string, lineOffset = 0): MarkdownBlock[] {
  const lines = source
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map<Line>((text, index) => ({ text, line: index + lineOffset }));
  return parseBlocks(lines);
}

function blank(line: Line): boolean {
  return line.text.trim() === '';
}

function startsBlock(text: string): boolean {
  return (
    FENCE.test(text) ||
    RULE.test(text) ||
    HEADING.test(text) ||
    QUOTE.test(text) ||
    BULLET.test(text)
  );
}

function indentWidth(text: string): number {
  return (/^[ \t]*/.exec(text)?.[0] ?? '').replace(/\t/g, '  ').length;
}

function parseBlocks(lines: readonly Line[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const current = lines[i];
    if (current === undefined) break;
    if (blank(current)) {
      i++;
      continue;
    }

    const fence = FENCE.exec(current.text);
    if (fence) {
      const marker = (fence[1] ?? '```').charAt(0) === '`' ? '`' : '~';
      const closing = new RegExp(`^ {0,3}${marker}{3,}[ \t]*$`);
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i];
        if (next === undefined) break;
        if (closing.test(next.text)) {
          i++;
          break;
        }
        body.push(next.text);
        i++;
      }
      const language = (fence[2] ?? '').trim();
      blocks.push({
        type: 'code',
        language: language || null,
        value: body.join('\n'),
        line: current.line,
      });
      continue;
    }

    if (RULE.test(current.text)) {
      blocks.push({ type: 'rule', line: current.line });
      i++;
      continue;
    }

    const heading = HEADING.exec(current.text);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: (heading[1] ?? '#').length,
        children: parseInline(heading[2] ?? ''),
        line: current.line,
      });
      i++;
      continue;
    }

    if (QUOTE.test(current.text)) {
      const body: Line[] = [];
      while (i < lines.length) {
        const next = lines[i];
        if (next === undefined) break;
        if (QUOTE.test(next.text)) {
          body.push({ text: next.text.replace(QUOTE, ''), line: next.line });
          i++;
          continue;
        }
        if (blank(next) || startsBlock(next.text)) break;
        body.push(next);
        i++;
      }
      blocks.push({ type: 'quote', children: parseBlocks(body), line: current.line });
      continue;
    }

    if (BULLET.test(current.text)) {
      const list = parseList(lines, i);
      blocks.push(list.block);
      i = list.next;
      continue;
    }

    if (isTableStart(lines, i)) {
      const table = parseTable(lines, i);
      blocks.push(table.block);
      i = table.next;
      continue;
    }

    const body: string[] = [];
    while (i < lines.length) {
      const next = lines[i];
      if (next === undefined) break;
      if (blank(next) || startsBlock(next.text) || isTableStart(lines, i)) break;
      body.push(next.text.trim());
      i++;
    }
    blocks.push({ type: 'paragraph', children: parseInline(body.join('\n')), line: current.line });
  }
  return blocks;
}

function parseList(lines: readonly Line[], from: number): { block: MarkdownBlock; next: number } {
  const head = lines[from];
  const first = BULLET.exec(head?.text ?? '');
  const ordered = Boolean(first?.[3]);
  const start = ordered ? Number(first?.[3] ?? '1') : 1;
  const markerIndent = indentWidth(head?.text ?? '');
  const items: ListItem[] = [];

  let itemLines: Line[] = [];
  let itemLine = head?.line ?? 0;
  let itemChecked: boolean | null = null;
  let contentIndent = markerIndent + 2;
  let started = false;
  let i = from;

  const closeItem = () => {
    if (started)
      items.push({ blocks: parseBlocks(itemLines), line: itemLine, checked: itemChecked });
    itemLines = [];
  };

  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined) break;
    const bullet = BULLET.exec(line.text);
    if (bullet && indentWidth(line.text) <= markerIndent) {
      if (Boolean(bullet[3]) !== ordered) break;
      closeItem();
      started = true;
      itemLine = line.line;
      const content = bullet[5] ?? '';
      const task = TASK.exec(content);
      itemChecked = task ? (task[1] ?? ' ').toLowerCase() === 'x' : null;
      itemLines = [{ text: task ? (task[2] ?? '') : content, line: line.line }];
      contentIndent = indentWidth(line.text) + (bullet[2] ?? '').length + (bullet[4] ?? '').length;
      i++;
      continue;
    }
    if (blank(line)) {
      const after = lines[i + 1];
      if (after && !blank(after) && indentWidth(after.text) >= contentIndent) {
        itemLines.push(line);
        i++;
        continue;
      }
      break;
    }
    if (indentWidth(line.text) >= contentIndent) {
      itemLines.push({
        text: line.text.replace(/\t/g, '  ').slice(contentIndent),
        line: line.line,
      });
      i++;
      continue;
    }
    if (!startsBlock(line.text)) {
      itemLines.push({ text: line.text.trim(), line: line.line });
      i++;
      continue;
    }
    break;
  }
  closeItem();
  return {
    block: { type: 'list', ordered, start, items, line: head?.line ?? 0 },
    next: i,
  };
}

function isTableStart(lines: readonly Line[], at: number): boolean {
  const header = lines[at];
  const delimiter = lines[at + 1];
  if (header === undefined || delimiter === undefined) return false;
  return (
    header.text.includes('|') &&
    delimiter.text.includes('|') &&
    TABLE_DELIMITER.test(delimiter.text)
  );
}

function splitCells(line: string): string[] {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells: string[] = [];
  let buffer = '';
  for (let i = 0; i < body.length; i++) {
    const char = body.charAt(i);
    if (char === '\\' && body.charAt(i + 1) === '|') {
      buffer += '|';
      i++;
      continue;
    }
    if (char === '|') {
      cells.push(buffer.trim());
      buffer = '';
      continue;
    }
    buffer += char;
  }
  cells.push(buffer.trim());
  return cells;
}

function parseTable(lines: readonly Line[], from: number): { block: MarkdownBlock; next: number } {
  const head = lines[from];
  const header = splitCells(head?.text ?? '');
  const align = splitCells(lines[from + 1]?.text ?? '').map<CellAlign>((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
  const rows: MarkdownInline[][][] = [];
  let i = from + 2;
  while (i < lines.length) {
    const line = lines[i];
    if (line === undefined || blank(line) || !line.text.includes('|')) break;
    const cells = splitCells(line.text);
    rows.push(header.map((_, column) => parseInline(cells[column] ?? '')));
    i++;
  }
  return {
    block: {
      type: 'table',
      align: header.map((_, column) => align[column] ?? null),
      header: header.map((cell) => parseInline(cell)),
      rows,
      line: head?.line ?? 0,
    },
    next: i,
  };
}

// ── inline ────────────────────────────────────────────────────────────────

const ESCAPABLE = /[\\`*_{}[\]()#+\-.!|>~]/;

function runLength(source: string, at: number, char: string): number {
  let length = 0;
  while (source.charAt(at + length) === char) length++;
  return length;
}

/** Index of the next run of `char` at least `min` long, or -1. */
function findClosingRun(source: string, from: number, char: string, min: number): number {
  for (let i = from; i < source.length; i++) {
    if (source.charAt(i) === '\\') {
      i++;
      continue;
    }
    if (source.charAt(i) !== char) continue;
    if (runLength(source, i, char) >= min) return i;
  }
  return -1;
}

interface LinkParts {
  label: string;
  href: string;
  end: number;
}

/** `[label](href "title")` beginning at `at`, which must be the `[`. */
function parseLinkAt(source: string, at: number): LinkParts | null {
  let depth = 0;
  let close = -1;
  for (let i = at; i < source.length; i++) {
    const char = source.charAt(i);
    if (char === '\\') {
      i++;
      continue;
    }
    if (char === '[') depth++;
    else if (char === ']') {
      depth--;
      if (depth === 0) {
        close = i;
        break;
      }
    }
  }
  if (close === -1 || source.charAt(close + 1) !== '(') return null;
  let parens = 0;
  let end = -1;
  for (let i = close + 1; i < source.length; i++) {
    const char = source.charAt(i);
    if (char === '\\') {
      i++;
      continue;
    }
    if (char === '(') parens++;
    else if (char === ')') {
      parens--;
      if (parens === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  const target = source.slice(close + 2, end).trim();
  const href = /^(\S+)(?:\s+["'(].*)?$/.exec(target)?.[1] ?? target;
  return { label: source.slice(at + 1, close), href, end: end + 1 };
}

export function parseInline(source: string): MarkdownInline[] {
  const out: MarkdownInline[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) out.push({ type: 'text', value: buffer });
    buffer = '';
  };

  let i = 0;
  while (i < source.length) {
    const char = source.charAt(i);

    if (char === '\\' && ESCAPABLE.test(source.charAt(i + 1))) {
      buffer += source.charAt(i + 1);
      i += 2;
      continue;
    }

    if (char === '`') {
      const run = runLength(source, i, '`');
      const close = findClosingRun(source, i + run, '`', run);
      if (close !== -1) {
        flush();
        const value = source.slice(i + run, close);
        out.push({
          type: 'code',
          value: value.length > 2 ? value.replace(/^ (.*) $/, '$1') : value,
        });
        i = close + run;
        continue;
      }
    }

    if (char === '!' && source.charAt(i + 1) === '[') {
      const image = parseLinkAt(source, i + 1);
      if (image) {
        i = image.end;
        continue;
      }
    }

    if (char === '[') {
      const link = parseLinkAt(source, i);
      if (link) {
        flush();
        const href = safeHref(link.href);
        const children = parseInline(link.label);
        if (href) out.push({ type: 'link', href, children });
        else out.push(...children);
        i = link.end;
        continue;
      }
    }

    if (char === '~' && runLength(source, i, '~') >= 2) {
      const close = findClosingRun(source, i + 2, '~', 2);
      if (close > i + 2) {
        flush();
        out.push({ type: 'strike', children: parseInline(source.slice(i + 2, close)) });
        i = close + 2;
        continue;
      }
    }

    if ((char === '*' || char === '_') && !(char === '_' && /\w/.test(source.charAt(i - 1)))) {
      const width = Math.min(runLength(source, i, char), 3);
      const inner = source.slice(i + width);
      if (inner && !/^\s/.test(inner)) {
        const close = findClosingRun(source, i + width, char, width);
        if (close > i + width) {
          flush();
          const children = parseInline(source.slice(i + width, close));
          out.push(
            width === 1
              ? { type: 'emphasis', children }
              : width === 2
                ? { type: 'strong', children }
                : { type: 'strong', children: [{ type: 'emphasis', children }] },
          );
          i = close + width;
          continue;
        }
      }
    }

    buffer += char;
    i++;
  }
  flush();
  return out;
}

// ── reading the tree ──────────────────────────────────────────────────────

/** The words of an inline run, with code spans left out. */
export function inlineText(nodes: readonly MarkdownInline[], includeCode = true): string {
  let out = '';
  for (const node of nodes) {
    switch (node.type) {
      case 'text':
        out += node.value;
        break;
      case 'code':
        if (includeCode) out += node.value;
        break;
      default:
        out += inlineText(node.children, includeCode);
    }
  }
  return out;
}

/**
 * Plain prose for every block, for export and for excerpts. Fenced code is
 * kept verbatim; everything else loses its syntax.
 */
export function blocksToText(blocks: readonly MarkdownBlock[], indent = ''): string[] {
  const out: string[] = [];
  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        out.push(indent + inlineText(block.children));
        out.push('');
        break;
      case 'paragraph':
        out.push(indent + inlineText(block.children));
        out.push('');
        break;
      case 'code':
        for (const line of block.value.split('\n')) out.push(indent + line);
        out.push('');
        break;
      case 'quote':
        out.push(...blocksToText(block.children, `${indent}  `));
        break;
      case 'rule':
        out.push(`${indent}----`);
        out.push('');
        break;
      case 'list': {
        block.items.forEach((item, index) => {
          const marker = block.ordered ? `${block.start + index}. ` : '- ';
          const box = item.checked === null ? '' : item.checked ? '[x] ' : '[ ] ';
          const body = blocksToText(item.blocks, '').filter((l) => l !== '');
          const [first = '', ...rest] = body;
          out.push(`${indent}${marker}${box}${first}`);
          for (const line of rest) out.push(`${indent}  ${line}`);
        });
        out.push('');
        break;
      }
      case 'table': {
        out.push(indent + block.header.map((cell) => inlineText(cell)).join('\t'));
        for (const row of block.rows) {
          out.push(indent + row.map((cell) => inlineText(cell)).join('\t'));
        }
        out.push('');
        break;
      }
    }
  }
  return out;
}

/** Markdown source rendered down to plain text, for "Export as Plain Text". */
export function toPlainText(source: string): string {
  return `${blocksToText(parseMarkdown(source))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

/** Every `#tag` in the source, skipping code spans and fenced code. */
export function collectTagTokens(source: string): string[] {
  const found: string[] = [];
  const visitInline = (nodes: readonly MarkdownInline[]) => {
    for (const node of nodes) {
      if (node.type === 'code') continue;
      if (node.type === 'text') {
        for (const match of node.value.matchAll(/(?:^|[\s([{,;:!?'"])#([A-Za-z][\w/-]*)/g)) {
          const tag = match[1];
          if (tag) found.push(tag);
        }
        continue;
      }
      if (node.type === 'link') {
        visitInline(node.children);
        continue;
      }
      visitInline(node.children);
    }
  };
  const visit = (blocks: readonly MarkdownBlock[]) => {
    for (const block of blocks) {
      switch (block.type) {
        case 'code':
          break;
        case 'heading':
        case 'paragraph':
          visitInline(block.children);
          break;
        case 'quote':
          visit(block.children);
          break;
        case 'list':
          for (const item of block.items) visit(item.blocks);
          break;
        case 'table':
          for (const cell of block.header) visitInline(cell);
          for (const row of block.rows) for (const cell of row) visitInline(cell);
          break;
        case 'rule':
          break;
      }
    }
  };
  visit(parseMarkdown(source));
  return found;
}

/** Flip the `[ ]` / `[x]` on one source line. Returns the text unchanged if there is none. */
export function toggleTaskAt(text: string, line: number): string {
  const lines = text.split('\n');
  const target = lines[line];
  if (target === undefined) return text;
  const match = TASK_LINE.exec(target);
  if (!match) return text;
  const state = (match[2] ?? ' ').toLowerCase() === 'x' ? ' ' : 'x';
  lines[line] = target.replace(TASK_LINE, `$1${state}$3`);
  return lines.join('\n');
}

// ── rendering ─────────────────────────────────────────────────────────────

export interface RenderOptions {
  /** Makes preview checkboxes live; called with the source line to rewrite. */
  onToggleTask?: (line: number) => void;
}

function renderInline(node: MarkdownInline, key: number): ReactNode {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'code':
      return createElement('code', { key }, node.value);
    case 'strong':
      return createElement('strong', { key }, renderInlines(node.children));
    case 'emphasis':
      return createElement('em', { key }, renderInlines(node.children));
    case 'strike':
      return createElement('del', { key }, renderInlines(node.children));
    case 'link':
      return createElement(
        'a',
        { key, href: node.href, target: '_blank', rel: 'noreferrer noopener' },
        renderInlines(node.children),
      );
  }
}

export function renderInlines(nodes: readonly MarkdownInline[]): ReactNode[] {
  return nodes.map((node, index) => renderInline(node, index));
}

function renderItem(item: ListItem, key: number, options: RenderOptions): ReactNode {
  const only = item.blocks.length === 1 ? item.blocks[0] : undefined;
  const inner =
    only?.type === 'paragraph' ? renderInlines(only.children) : renderBlocks(item.blocks, options);

  if (item.checked === null) return createElement('li', { key }, inner);

  const toggle = options.onToggleTask;
  const box = createElement('input', {
    type: 'checkbox',
    checked: item.checked,
    disabled: !toggle,
    onChange: toggle ? () => toggle(item.line) : undefined,
    'aria-label': only?.type === 'paragraph' ? inlineText(only.children) : 'Task',
    className: 'mt-1 size-3.5 shrink-0 accent-[var(--lumen-accent)] lumen-focus',
  });
  return createElement(
    'li',
    { key, className: 'flex items-start gap-2 list-none -ml-5' },
    box,
    createElement('span', { className: 'min-w-0 flex-1' }, inner),
  );
}

function renderBlock(block: MarkdownBlock, key: number, options: RenderOptions): ReactNode {
  switch (block.type) {
    case 'heading':
      return createElement(`h${Math.min(6, block.level)}`, { key }, renderInlines(block.children));
    case 'paragraph':
      return createElement('p', { key }, renderInlines(block.children));
    case 'code':
      return createElement(
        'pre',
        { key, 'data-language': block.language ?? undefined },
        createElement('code', null, block.value),
      );
    case 'quote':
      return createElement('blockquote', { key }, renderBlocks(block.children, options));
    case 'rule':
      return createElement('hr', { key });
    case 'list':
      return createElement(
        block.ordered ? 'ol' : 'ul',
        { key, start: block.ordered && block.start !== 1 ? block.start : undefined },
        block.items.map((item, index) => renderItem(item, index, options)),
      );
    case 'table':
      return createElement('table', { key }, [
        createElement(
          'thead',
          { key: 'head' },
          createElement(
            'tr',
            null,
            block.header.map((cell, column) =>
              createElement(
                'th',
                { key: column, style: { textAlign: block.align[column] ?? undefined } },
                renderInlines(cell),
              ),
            ),
          ),
        ),
        createElement(
          'tbody',
          { key: 'body' },
          block.rows.map((row, index) =>
            createElement(
              'tr',
              { key: index },
              row.map((cell, column) =>
                createElement(
                  'td',
                  { key: column, style: { textAlign: block.align[column] ?? undefined } },
                  renderInlines(cell),
                ),
              ),
            ),
          ),
        ),
      ]);
  }
}

export function renderBlocks(
  blocks: readonly MarkdownBlock[],
  options: RenderOptions = {},
): ReactNode[] {
  return blocks.map((block, index) => renderBlock(block, index, options));
}

/** Parse and render in one step. `lineOffset` maps AST lines back to the file. */
export function renderMarkdown(
  source: string,
  options: RenderOptions & { lineOffset?: number } = {},
): ReactNode[] {
  return renderBlocks(parseMarkdown(source, options.lineOffset ?? 0), options);
}
