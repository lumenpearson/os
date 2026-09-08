/**
 * A small Markdown reader for the preview pane. It parses to a data tree and
 * renders that tree with `createElement`, so nothing from the document can
 * become markup: there is no HTML path in or out. Raw HTML in the source is
 * shown as text, links are limited to http, https and mailto, and images are
 * dropped.
 */
import { createElement, type ReactNode } from 'react';

export type MarkdownInline =
  | { type: 'text'; value: string }
  | { type: 'code'; value: string }
  | { type: 'strong'; children: MarkdownInline[] }
  | { type: 'emphasis'; children: MarkdownInline[] }
  | { type: 'link'; href: string; children: MarkdownInline[] };

export type CellAlign = 'left' | 'center' | 'right' | null;

export type MarkdownBlock =
  | { type: 'heading'; level: number; children: MarkdownInline[] }
  | { type: 'paragraph'; children: MarkdownInline[] }
  | { type: 'code'; language: string | null; value: string }
  | { type: 'quote'; children: MarkdownBlock[] }
  | { type: 'list'; ordered: boolean; start: number; items: MarkdownBlock[][] }
  | { type: 'rule' }
  | { type: 'table'; align: CellAlign[]; header: MarkdownInline[][]; rows: MarkdownInline[][][] };

const FENCE = /^ {0,3}(```+|~~~+)\s*([^`]*)$/;
const RULE = /^ {0,3}([-*_])[ \t]*(?:\1[ \t]*){2,}$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const QUOTE = /^ {0,3}>[ \t]?/;
const BULLET = /^([ \t]*)([-*+]|(\d{1,9})[.)])([ \t]+)(.*)$/;
const TABLE_DELIMITER = /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/** Only these schemes reach the DOM; everything else renders as plain text. */
export const SAFE_SCHEMES = ['http://', 'https://', 'mailto:'] as const;

export function safeHref(raw: string): string | null {
  const href = raw.trim();
  if (!href) return null;
  // Control characters or spaces can hide a scheme ("java\nscript:") — reject them.
  for (let i = 0; i < href.length; i++) {
    const code = href.charCodeAt(i);
    if (code <= 0x20 || code === 0x7f) return null;
  }
  const lower = href.toLowerCase();
  return SAFE_SCHEMES.some((scheme) => lower.startsWith(scheme)) ? href : null;
}

export function parseMarkdown(source: string): MarkdownBlock[] {
  return parseBlocks(source.replace(/\r\n?/g, '\n').split('\n'));
}

function blankLine(line: string): boolean {
  return line.trim() === '';
}

function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    RULE.test(line) ||
    HEADING.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line)
  );
}

function leadingWidth(line: string): number {
  const indent = /^[ \t]*/.exec(line)?.[0] ?? '';
  return indent.replace(/\t/g, '  ').length;
}

function parseBlocks(lines: readonly string[]): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (blankLine(line)) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = (fence[1] ?? '```').charAt(0);
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const next = lines[i] ?? '';
        if (new RegExp(`^ {0,3}${marker === '`' ? '`' : '~'}{3,}[ \t]*$`).test(next)) {
          i++;
          break;
        }
        body.push(next);
        i++;
      }
      const language = (fence[2] ?? '').trim();
      blocks.push({ type: 'code', language: language || null, value: body.join('\n') });
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({
        type: 'heading',
        level: (heading[1] ?? '#').length,
        children: parseInline(heading[2] ?? ''),
      });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length) {
        const next = lines[i] ?? '';
        if (QUOTE.test(next)) {
          body.push(next.replace(QUOTE, ''));
          i++;
          continue;
        }
        if (blankLine(next) || startsBlock(next)) break;
        body.push(next);
        i++;
      }
      blocks.push({ type: 'quote', children: parseBlocks(body) });
      continue;
    }

    const bullet = BULLET.exec(line);
    if (bullet) {
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
      const next = lines[i] ?? '';
      if (blankLine(next) || startsBlock(next) || isTableStart(lines, i)) break;
      body.push(next.trim());
      i++;
    }
    blocks.push({ type: 'paragraph', children: parseInline(body.join('\n')) });
  }
  return blocks;
}

function parseList(lines: readonly string[], from: number): { block: MarkdownBlock; next: number } {
  const first = BULLET.exec(lines[from] ?? '');
  const ordered = Boolean(first?.[3]);
  const start = ordered ? Number(first?.[3] ?? '1') : 1;
  const markerIndent = leadingWidth(lines[from] ?? '');
  const items: MarkdownBlock[][] = [];
  let itemLines: string[] = [];
  let contentIndent = markerIndent + 2;
  let started = false;
  let i = from;

  const closeItem = () => {
    if (started) items.push(parseBlocks(itemLines));
    itemLines = [];
  };

  while (i < lines.length) {
    const line = lines[i] ?? '';
    const bullet = BULLET.exec(line);
    if (bullet && leadingWidth(line) <= markerIndent) {
      if (Boolean(bullet[3]) !== ordered) break;
      closeItem();
      started = true;
      itemLines = [bullet[5] ?? ''];
      contentIndent = leadingWidth(line) + (bullet[2] ?? '').length + (bullet[4] ?? '').length;
      i++;
      continue;
    }
    if (blankLine(line)) {
      const after = lines[i + 1] ?? '';
      if (!blankLine(after) && leadingWidth(after) >= contentIndent) {
        itemLines.push('');
        i++;
        continue;
      }
      break;
    }
    if (leadingWidth(line) >= contentIndent) {
      itemLines.push(line.replace(/\t/g, '  ').slice(contentIndent));
      i++;
      continue;
    }
    if (!startsBlock(line)) {
      itemLines.push(line.trim());
      i++;
      continue;
    }
    break;
  }
  closeItem();
  return { block: { type: 'list', ordered, start, items }, next: i };
}

function isTableStart(lines: readonly string[], at: number): boolean {
  const header = lines[at];
  const delimiter = lines[at + 1];
  if (header === undefined || delimiter === undefined) return false;
  return header.includes('|') && delimiter.includes('|') && TABLE_DELIMITER.test(delimiter);
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

function parseTable(
  lines: readonly string[],
  from: number,
): { block: MarkdownBlock; next: number } {
  const header = splitCells(lines[from] ?? '');
  const align = splitCells(lines[from + 1] ?? '').map<CellAlign>((cell) => {
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
    const line = lines[i] ?? '';
    if (blankLine(line) || !line.includes('|')) break;
    const cells = splitCells(line);
    rows.push(header.map((_, column) => parseInline(cells[column] ?? '')));
    i++;
  }
  return {
    block: {
      type: 'table',
      align: header.map((_, column) => align[column] ?? null),
      header: header.map((cell) => parseInline(cell)),
      rows,
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

// ── rendering ─────────────────────────────────────────────────────────────

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

function renderItem(blocks: MarkdownBlock[], key: number): ReactNode {
  const only = blocks.length === 1 ? blocks[0] : undefined;
  if (only?.type === 'paragraph') return createElement('li', { key }, renderInlines(only.children));
  return createElement('li', { key }, renderBlocks(blocks));
}

function renderBlock(block: MarkdownBlock, key: number): ReactNode {
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
      return createElement('blockquote', { key }, renderBlocks(block.children));
    case 'rule':
      return createElement('hr', { key });
    case 'list':
      return createElement(
        block.ordered ? 'ol' : 'ul',
        { key, start: block.ordered && block.start !== 1 ? block.start : undefined },
        block.items.map((item, index) => renderItem(item, index)),
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

export function renderBlocks(blocks: readonly MarkdownBlock[]): ReactNode[] {
  return blocks.map((block, index) => renderBlock(block, index));
}

/** Parse and render in one step: what the preview pane shows. */
export function renderMarkdown(source: string): ReactNode {
  return renderBlocks(parseMarkdown(source));
}
