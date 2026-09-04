/**
 * The document allow-list. Everything that enters the editor — a file from
 * disk, a paste from another program — goes through here first, so the stored
 * HTML only ever contains tags the editor itself can produce.
 */
import { isElement, parseBody, tagOf } from './dom';

/** An empty document still needs a paragraph to put the caret in. */
export const EMPTY_DOCUMENT = '<p><br></p>';

export const ALLOWED_TAGS = [
  'p',
  'h1',
  'h2',
  'h3',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'b',
  'strong',
  'i',
  'em',
  'u',
  's',
  'a',
  'br',
  'hr',
  'span',
] as const;

const ALLOWED = new Set<string>(ALLOWED_TAGS);

/** Removed with their contents: behaviour, media and metadata, not text. */
const DROPPED = new Set([
  'applet',
  'audio',
  'base',
  'button',
  'canvas',
  'embed',
  'form',
  'frame',
  'frameset',
  'head',
  'iframe',
  'img',
  'input',
  'link',
  'map',
  'math',
  'meta',
  'noscript',
  'object',
  'picture',
  'script',
  'select',
  'source',
  'style',
  'svg',
  'template',
  'textarea',
  'title',
  'track',
  'video',
]);

/** Close-enough replacements, so text from other programs keeps its shape. */
const RENAMED: Record<string, string> = {
  abbr: 'span',
  address: 'p',
  article: 'p',
  aside: 'p',
  caption: 'p',
  cite: 'em',
  dd: 'p',
  del: 's',
  dfn: 'em',
  div: 'p',
  dl: 'p',
  dt: 'p',
  figcaption: 'p',
  figure: 'p',
  font: 'span',
  footer: 'p',
  h4: 'h3',
  h5: 'h3',
  h6: 'h3',
  header: 'p',
  ins: 'u',
  kbd: 'code',
  label: 'span',
  main: 'p',
  mark: 'span',
  nav: 'p',
  q: 'em',
  samp: 'code',
  section: 'p',
  small: 'span',
  strike: 's',
  sub: 'span',
  sup: 'span',
  time: 'span',
  tr: 'p',
  tt: 'code',
  var: 'em',
};

const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'pre', 'hr']);

/** Blocks whose alignment the editor writes and reads back. */
const ALIGNABLE = new Set(['p', 'h1', 'h2', 'h3', 'blockquote', 'pre', 'li', 'ul', 'ol']);
const ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);

/** Renaming one of these to a paragraph is wrong when it holds blocks. */
const SIMPLE_BLOCKS = new Set(['p', 'h1', 'h2', 'h3']);

const SAFE_PROTOCOL = /^(?:https?:|mailto:)/i;
/** Highest code point dropped before a protocol check: space and below. */
const BLANK_LIMIT = 32;

/** Drop spaces and control characters, which otherwise hide a script URL. */
function stripBlanks(value: string): string {
  return Array.from(value, (ch) => ((ch.codePointAt(0) ?? 0) > BLANK_LIMIT ? ch : '')).join('');
}

/** Only links the editor is willing to follow: http, https, mailto. */
export function isSafeHref(href: string): boolean {
  return SAFE_PROTOCOL.test(stripBlanks(href));
}

/**
 * What the link dialog accepts. A bare host gets https, an address with an @
 * gets mailto; anything else must already carry a safe protocol.
 */
export function normalizeLinkInput(input: string): string | null {
  const value = input.trim();
  if (value === '') return null;
  if (isSafeHref(value)) return stripBlanks(value);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return `mailto:${value}`;
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(value)) return `https://${value}`;
  return null;
}

/** The text-align value a block carries, or null when it has none. */
export function alignFromStyle(style: string | null): string | null {
  const match = /(?:^|;)\s*text-align\s*:\s*([a-z-]+)/i.exec(style ?? '');
  const value = match?.[1]?.toLowerCase();
  return value !== undefined && ALIGNMENTS.has(value) ? value : null;
}

/** Sanitise a fragment: used for paste, where inline content must stay inline. */
export function sanitizeHtml(html: string): string {
  const body = parseBody(html);
  cleanChildren(body);
  return body.innerHTML;
}

/**
 * Sanitise a whole document: loose text at the top level becomes paragraphs,
 * and an empty result becomes an empty paragraph.
 */
export function sanitizeDocument(html: string): string {
  const body = parseBody(html);
  cleanChildren(body);
  wrapLooseInlines(body);
  const result = body.innerHTML.trim();
  return result === '' ? EMPTY_DOCUMENT : result;
}

function cleanChildren(parent: Element): void {
  for (const child of Array.from(parent.childNodes)) {
    if (isElement(child)) cleanElement(child);
    else if (child.nodeType !== 3) child.remove();
  }
}

function cleanElement(element: Element): void {
  const tag = tagOf(element);
  if (DROPPED.has(tag)) {
    element.remove();
    return;
  }
  cleanChildren(element);
  const mapped = RENAMED[tag] ?? tag;
  if (!ALLOWED.has(mapped)) {
    unwrap(element);
    return;
  }
  if (mapped === 'a' && !isSafeHref(element.getAttribute('href') ?? '')) {
    unwrap(element);
    return;
  }
  const target = mapped === tag ? element : rename(element, mapped);
  if (target !== null) cleanAttributes(target, mapped);
}

/** Replace an element with one of another tag, keeping children and alignment. */
function rename(element: Element, tag: string): Element | null {
  if (SIMPLE_BLOCKS.has(tag) && hasBlockChild(element)) {
    unwrap(element);
    return null;
  }
  const next = element.ownerDocument.createElement(tag);
  const style = element.getAttribute('style');
  const align = element.getAttribute('align');
  if (style !== null) next.setAttribute('style', style);
  if (align !== null) next.setAttribute('align', align);
  while (element.firstChild !== null) next.appendChild(element.firstChild);
  element.replaceWith(next);
  return next;
}

/** Drop the element but keep its children where it stood. */
function unwrap(element: Element): void {
  const parent = element.parentNode;
  if (parent === null) return;
  while (element.firstChild !== null) parent.insertBefore(element.firstChild, element);
  element.remove();
}

function hasBlockChild(element: Element): boolean {
  return Array.from(element.children).some((child) => BLOCKS.has(tagOf(child)));
}

function cleanAttributes(element: Element, tag: string): void {
  const href = tag === 'a' ? element.getAttribute('href') : null;
  const align = ALIGNABLE.has(tag)
    ? (alignFromStyle(element.getAttribute('style')) ?? alignFromAttribute(element))
    : null;
  for (const name of element.getAttributeNames()) element.removeAttribute(name);
  if (href !== null) element.setAttribute('href', href.trim());
  if (align !== null) element.setAttribute('style', `text-align: ${align}`);
}

function alignFromAttribute(element: Element): string | null {
  const value = element.getAttribute('align')?.toLowerCase();
  return value !== undefined && ALIGNMENTS.has(value) ? value : null;
}

/** Wrap runs of top-level inline content in paragraphs. */
function wrapLooseInlines(body: HTMLElement): void {
  let run: ChildNode[] = [];
  const flush = () => {
    const first = run[0];
    if (first === undefined) return;
    const paragraph = body.ownerDocument.createElement('p');
    first.parentNode?.insertBefore(paragraph, first);
    for (const node of run) paragraph.appendChild(node);
    run = [];
  };
  for (const child of Array.from(body.childNodes)) {
    if (BLOCKS.has(tagOf(child))) {
      flush();
      continue;
    }
    if (run.length === 0 && !isElement(child) && (child.textContent ?? '').trim() === '') {
      child.remove();
      continue;
    }
    run.push(child);
  }
  flush();
}
