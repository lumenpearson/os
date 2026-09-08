/**
 * What the status bar reports, and the plain-text projection of a document
 * that File → Export as Plain Text writes.
 */
import { collapseWhitespace, isElement, isText, parseBody, tagOf } from './dom';

/** Average adult reading speed for prose, rounded to a flat number. */
export const WORDS_PER_MINUTE = 220;

/** Typed as a code point so the source stays free of invisible characters. */
const NBSP = String.fromCharCode(160);

export interface TextStats {
  words: number;
  characters: number;
  charactersNoSpaces: number;
  /** Whole minutes, at least 1 once there is a word. */
  minutes: number;
}

export function countWords(text: string): number {
  const trimmed = text.split(NBSP).join(' ').trim();
  return trimmed === '' ? 0 : trimmed.split(/\s+/).length;
}

export function readingMinutes(words: number, wordsPerMinute = WORDS_PER_MINUTE): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.ceil(words / wordsPerMinute));
}

export function textStats(text: string): TextStats {
  const normalized = text.split(NBSP).join(' ');
  const words = countWords(normalized);
  return {
    words,
    characters: Array.from(normalized).length,
    charactersNoSpaces: Array.from(normalized.replace(/\s/g, '')).length,
    minutes: readingMinutes(words),
  };
}

/** The document as text: blocks separated by blank lines, list items by lines. */
export function htmlToPlainText(html: string): string {
  return blocksToText(Array.from(parseBody(html).childNodes)).trim();
}

function blocksToText(nodes: ChildNode[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    const text = blockText(node);
    if (text !== '') parts.push(text);
  }
  return parts.join('\n\n');
}

function blockText(node: ChildNode): string {
  if (isText(node)) return collapseWhitespace(node.data).trim();
  if (!isElement(node)) return '';
  switch (tagOf(node)) {
    case 'hr':
      return '---';
    case 'pre':
      return (node.textContent ?? '').replace(/\n+$/, '');
    case 'ul':
    case 'ol':
      return listText(node);
    case 'blockquote':
      return blocksToText(Array.from(node.childNodes));
    default:
      return inlineText(node).trim();
  }
}

function listText(list: Element): string {
  const lines: string[] = [];
  for (const item of Array.from(list.children)) {
    if (tagOf(item) !== 'li') continue;
    const nested: string[] = [];
    const inline: ChildNode[] = [];
    for (const child of Array.from(item.childNodes)) {
      const tag = tagOf(child);
      if (isElement(child) && (tag === 'ul' || tag === 'ol')) nested.push(listText(child));
      else inline.push(child);
    }
    const text = inline.map(inlineNodeText).join('').trim();
    if (text !== '') lines.push(text);
    for (const block of nested) lines.push(indentBy(block, '  '));
  }
  return lines.join('\n');
}

function inlineText(element: Element): string {
  return Array.from(element.childNodes).map(inlineNodeText).join('');
}

function inlineNodeText(node: ChildNode): string {
  if (isText(node)) return collapseWhitespace(node.data);
  if (!isElement(node)) return '';
  if (tagOf(node) === 'br') return '\n';
  return inlineText(node);
}

function indentBy(text: string, indent: string): string {
  return text
    .split('\n')
    .map((line) => (line === '' ? line : indent + line))
    .join('\n');
}
