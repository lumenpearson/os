/**
 * Shared DOM helpers for reading Writer documents. One parser, one escaper,
 * so the sanitiser, the Markdown converter and the exporters agree on how a
 * document is read.
 */

/** Parse a fragment (or a whole document) and return the body that holds it. */
export function parseBody(html: string): HTMLElement {
  const parsed = new DOMParser().parseFromString(`<!doctype html><body>${html}`, 'text/html');
  return parsed.body;
}

export function isElement(node: Node): node is Element {
  return node.nodeType === 1;
}

export function isText(node: Node): node is Text {
  return node.nodeType === 3;
}

/** Lower-case tag name, or '' for anything that is not an element. */
export function tagOf(node: Node | null): string {
  return node !== null && isElement(node) ? node.tagName.toLowerCase() : '';
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}

/** Collapse HTML whitespace the way a renderer would, outside <pre>. */
export function collapseWhitespace(text: string): string {
  return text.replace(/[\t\n\r ]+/g, ' ');
}
