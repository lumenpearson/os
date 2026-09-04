/**
 * Find inside the document. Matches are computed on the text of the page and
 * mapped back to ranges, which are painted with the CSS Custom Highlight API
 * where it exists (it does not touch the DOM, so it cannot disturb editing)
 * and selected one at a time where it does not.
 */
import { isText } from './dom';

/**
 * Highlight registry names. They are global to the page, so each window gets
 * its own pair and one Writer window cannot wipe another's search.
 */
export interface HighlightNames {
  all: string;
  current: string;
}

export function highlightNames(windowId: string): HighlightNames {
  const suffix = windowId.replace(/[^a-zA-Z0-9_-]/g, '') || 'window';
  return { all: `lumen-writer-match-${suffix}`, current: `lumen-writer-current-${suffix}` };
}

export interface Match {
  start: number;
  end: number;
}

/** Non-overlapping matches, in document order. */
export function findMatches(haystack: string, needle: string, caseSensitive = false): Match[] {
  if (needle === '') return [];
  const hay = caseSensitive ? haystack : haystack.toLowerCase();
  const query = caseSensitive ? needle : needle.toLowerCase();
  const matches: Match[] = [];
  let from = 0;
  while (from <= hay.length - query.length) {
    const at = hay.indexOf(query, from);
    if (at === -1) break;
    matches.push({ start: at, end: at + query.length });
    from = at + query.length;
  }
  return matches;
}

/** Move to the next or previous match, wrapping at both ends. */
export function stepMatch(current: number, total: number, direction: 1 | -1): number {
  if (total <= 0) return 0;
  return (((current + direction) % total) + total) % total;
}

export interface TextIndex {
  text: string;
  nodes: Array<{ node: Text; start: number }>;
}

export function buildTextIndex(root: HTMLElement): TextIndex {
  const nodes: TextIndex['nodes'] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = '';
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    if (!isText(node)) continue;
    nodes.push({ node, start: text.length });
    text += node.data;
  }
  return { text, nodes };
}

export function rangeForMatch(index: TextIndex, match: Match): Range | null {
  const start = locate(index, match.start);
  const end = locate(index, match.end);
  if (start === null || end === null) return null;
  const range = start.node.ownerDocument.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}

/** Binary search for the text node that holds a document offset. */
function locate(index: TextIndex, offset: number): { node: Text; offset: number } | null {
  const { nodes } = index;
  if (nodes.length === 0) return null;
  let low = 0;
  let high = nodes.length - 1;
  let found = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const entry = nodes[mid];
    if (entry === undefined) break;
    if (entry.start <= offset) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const entry = nodes[found];
  if (entry === undefined) return null;
  return { node: entry.node, offset: Math.min(offset - entry.start, entry.node.data.length) };
}

type HighlightConstructor = new (...ranges: Range[]) => object;
interface HighlightRegistry {
  set(name: string, highlight: object): void;
  delete(name: string): void;
}

function highlightApi(): { create: HighlightConstructor; registry: HighlightRegistry } | null {
  const scope = globalThis as {
    Highlight?: HighlightConstructor;
    CSS?: { highlights?: HighlightRegistry };
  };
  const create = scope.Highlight;
  const registry = scope.CSS?.highlights;
  if (typeof create !== 'function' || registry === undefined) return null;
  return { create, registry };
}

export function supportsHighlights(): boolean {
  return highlightApi() !== null;
}

/** Paint every match, and the current one on top. Returns false without the API. */
export function showMatches(
  names: HighlightNames,
  ranges: Range[],
  current: Range | null,
): boolean {
  const api = highlightApi();
  if (api === null) return false;
  paint(api, names.all, ranges);
  paint(api, names.current, current === null ? [] : [current]);
  return true;
}

export function clearMatches(names: HighlightNames): void {
  const api = highlightApi();
  if (api === null) return;
  api.registry.delete(names.all);
  api.registry.delete(names.current);
}

function paint(
  api: { create: HighlightConstructor; registry: HighlightRegistry },
  name: string,
  ranges: Range[],
): void {
  if (ranges.length === 0) api.registry.delete(name);
  else api.registry.set(name, new api.create(...ranges));
}

export function selectRange(range: Range): void {
  const selection = range.startContainer.ownerDocument?.getSelection();
  if (selection === null || selection === undefined) return;
  selection.removeAllRanges();
  selection.addRange(range);
}

/** Bring a match into view without jumping when it is already visible. */
export function scrollRangeIntoView(range: Range, scroller: HTMLElement): void {
  if (typeof range.getBoundingClientRect !== 'function') return;
  const rect = range.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  if (rect.height === 0 && rect.width === 0) return;
  if (rect.top >= box.top + 8 && rect.bottom <= box.bottom - 8) return;
  scroller.scrollTop += rect.top - box.top - box.height / 3;
}
