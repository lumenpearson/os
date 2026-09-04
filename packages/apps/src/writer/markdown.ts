/**
 * HTML to Markdown for File → Export as Markdown. The input is a sanitised
 * Writer document, so only the tags in the allow-list have to be handled;
 * anything else contributes its text.
 */
import { collapseWhitespace, isElement, isText, parseBody, tagOf } from './dom';

/** Characters that would otherwise be read as Markdown syntax. */
const SPECIALS = /([\\`*_[\]])/g;
/** Markers that only mean something at the start of a line. */
const LINE_STARTERS = /^(#{1,6}\s|>|-\s|\+\s|\d+\.\s)/;

export function htmlToMarkdown(html: string): string {
  const body = parseBody(html);
  const blocks = renderBlocks(Array.from(body.childNodes));
  const text = blocks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text === '' ? '' : `${text}\n`;
}

function renderBlocks(nodes: ChildNode[]): string[] {
  const out: string[] = [];
  for (const node of nodes) {
    const block = renderBlock(node);
    if (block !== '') out.push(block);
  }
  return out;
}

function renderBlock(node: ChildNode): string {
  if (isText(node)) return escapeStart(escapeText(collapseWhitespace(node.data).trim()));
  if (!isElement(node)) return '';
  const tag = tagOf(node);
  switch (tag) {
    case 'h1':
    case 'h2':
    case 'h3': {
      const heading = inlineChildren(node).trim();
      return heading === '' ? '' : `${'#'.repeat(Number(tag.slice(1)))} ${heading}`;
    }
    case 'hr':
      return '---';
    case 'pre':
      return fence(node.textContent ?? '');
    case 'blockquote':
      return quote(renderBlocks(Array.from(node.childNodes)));
    case 'ul':
    case 'ol':
      return renderList(node, tag === 'ol');
    case 'br':
      return '';
    default:
      return escapeStart(inlineChildren(node).trim());
  }
}

function renderList(list: Element, ordered: boolean): string {
  const lines: string[] = [];
  let index = 1;
  for (const child of Array.from(list.children)) {
    if (tagOf(child) !== 'li') continue;
    lines.push(renderItem(child, ordered ? `${index}. ` : '- '));
    index += 1;
  }
  return lines.join('\n');
}

function renderItem(item: Element, marker: string): string {
  const nested: string[] = [];
  const inline: ChildNode[] = [];
  for (const child of Array.from(item.childNodes)) {
    const tag = tagOf(child);
    if (isElement(child) && (tag === 'ul' || tag === 'ol'))
      nested.push(renderList(child, tag === 'ol'));
    else inline.push(child);
  }
  const text = inline.map(renderInline).join('').trim();
  const indent = ' '.repeat(marker.length);
  return [`${marker}${text}`, ...nested.map((block) => indentBy(block, indent))].join('\n');
}

function renderInline(node: ChildNode): string {
  if (isText(node)) return escapeText(collapseWhitespace(node.data));
  if (!isElement(node)) return '';
  switch (tagOf(node)) {
    case 'br':
      return '  \n';
    case 'b':
    case 'strong':
      return emphasise(inlineChildren(node), '**');
    case 'i':
    case 'em':
      return emphasise(inlineChildren(node), '*');
    case 's':
      return emphasise(inlineChildren(node), '~~');
    case 'code':
      return codeSpan(node.textContent ?? '');
    case 'a':
      return link(node);
    default:
      return inlineChildren(node);
  }
}

function inlineChildren(element: Element): string {
  return Array.from(element.childNodes).map(renderInline).join('');
}

function link(anchor: Element): string {
  const href = anchor.getAttribute('href');
  const label = inlineChildren(anchor).trim();
  if (href === null || href === '') return label;
  return `[${label === '' ? href : label}](${href})`;
}

/** Keep the markers tight against the text: "** bold **" is not emphasis. */
function emphasise(text: string, marker: string): string {
  const inner = text.trim();
  if (inner === '') return text;
  const lead = text.slice(0, text.length - text.trimStart().length);
  const tail = text.slice(text.trimEnd().length);
  return `${lead}${marker}${inner}${marker}${tail}`;
}

function codeSpan(text: string): string {
  const value = collapseWhitespace(text);
  if (value === '') return '';
  const wrapper = value.includes('`') ? '``' : '`';
  const pad = value.startsWith('`') || value.endsWith('`') ? ' ' : '';
  return `${wrapper}${pad}${value}${pad}${wrapper}`;
}

function fence(code: string): string {
  const body = code.replace(/\n+$/, '');
  const longest = Math.max(0, ...Array.from(body.matchAll(/`+/g), (m) => m[0].length));
  const rail = '`'.repeat(Math.max(3, longest + 1));
  return `${rail}\n${body}\n${rail}`;
}

function quote(blocks: string[]): string {
  return blocks
    .join('\n\n')
    .split('\n')
    .map((line) => (line === '' ? '>' : `> ${line}`))
    .join('\n');
}

function indentBy(text: string, indent: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? line : indent + line))
    .join('\n');
}

function escapeText(text: string): string {
  return text.replace(SPECIALS, '\\$1');
}

function escapeStart(text: string): string {
  return text.replace(LINE_STARTERS, '\\$1');
}
