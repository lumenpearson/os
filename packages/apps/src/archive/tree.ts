/**
 * The list on screen, derived from the flat list of entries an archive holds.
 *
 * A ZIP has no tree in it: `docs/images/a.png` is one string, and whether
 * `docs/` and `docs/images/` have entries of their own is up to whoever wrote
 * the archive. So the folders are rebuilt here — the ones the archive lists
 * and the ones it only implies — each folder carrying the totals of what is
 * under it. Sorting, searching and expansion then produce the rows the table
 * draws, which is all the component has to know about.
 */

import { savingRatio } from './format';
import type { ZipEntry } from './zip';

export type SortColumn = 'name' | 'size' | 'packed' | 'ratio' | 'modified';

export const SORT_COLUMNS: readonly SortColumn[] = ['name', 'size', 'packed', 'ratio', 'modified'];

export const SORT_LABELS: Record<SortColumn, string> = {
  name: 'Name',
  size: 'Size',
  packed: 'Packed',
  ratio: 'Ratio',
  modified: 'Modified',
};

export interface SortState {
  column: SortColumn;
  direction: 'asc' | 'desc';
}

export const DEFAULT_SORT: SortState = { column: 'name', direction: 'asc' };

export interface ArchiveNode {
  /** Unique within one archive, even when two entries share a path. */
  id: string;
  /** The path this node sits at, `/` separated, no trailing slash. */
  path: string;
  name: string;
  isDirectory: boolean;
  /** Index into the archive's entries, or -1 for a folder the archive only implies. */
  entry: number;
  children: ArchiveNode[];
  /** Uncompressed bytes at or below this node. */
  size: number;
  /** Stored bytes at or below this node. */
  packed: number;
  /** The newest modification time at or below this node. */
  modifiedAt: number;
  /** Files at or below this node; 0 for an empty folder. */
  files: number;
}

/** Above this many entries an archive opens collapsed rather than pouring out. */
export const EXPAND_LIMIT = 200;

function makeNode(path: string, name: string, isDirectory: boolean, entry: number): ArchiveNode {
  return {
    id: path,
    path,
    name,
    isDirectory,
    entry,
    children: [],
    size: 0,
    packed: 0,
    modifiedAt: 0,
    files: 0,
  };
}

/** The name split into the components that make a path, ignoring empty ones. */
export function nameComponents(name: string): string[] {
  return name.split('/').filter((part) => part.length > 0);
}

function aggregate(node: ArchiveNode): void {
  if (!node.isDirectory) return;
  for (const child of node.children) {
    aggregate(child);
    node.size += child.size;
    node.packed += child.packed;
    node.files += child.isDirectory ? child.files : 1;
    node.modifiedAt = Math.max(node.modifiedAt, child.modifiedAt);
  }
}

/** Fold the archive's entries into folders and files with their totals. */
export function buildTree(entries: readonly ZipEntry[]): ArchiveNode[] {
  const roots: ArchiveNode[] = [];
  const folders = new Map<string, ArchiveNode>();
  const usedIds = new Set<string>();

  /** Ids have to stay unique: an archive may hold two entries of one name. */
  const uniqueId = (path: string): string => {
    if (!usedIds.has(path)) {
      usedIds.add(path);
      return path;
    }
    let suffix = 2;
    while (usedIds.has(`${path}#${suffix}`)) suffix += 1;
    usedIds.add(`${path}#${suffix}`);
    return `${path}#${suffix}`;
  };

  const folderAt = (path: string, components: string[]): ArchiveNode | null => {
    const found = folders.get(path);
    if (found) return found;
    const name = components[components.length - 1];
    if (name === undefined) return null;
    const node = makeNode(path, name, true, -1);
    node.id = uniqueId(path);
    folders.set(path, node);
    const parentPath = components.slice(0, -1).join('/');
    const parent = parentPath === '' ? null : folderAt(parentPath, components.slice(0, -1));
    if (parent) parent.children.push(node);
    else roots.push(node);
    return node;
  };

  for (const [index, entry] of entries.entries()) {
    const components = nameComponents(entry.name);
    if (components.length === 0) continue;
    const path = components.join('/');
    const name = components[components.length - 1] as string;

    if (entry.isDirectory) {
      const node = folderAt(path, components);
      if (node) node.entry = index;
      continue;
    }

    const parentComponents = components.slice(0, -1);
    const parent =
      parentComponents.length === 0 ? null : folderAt(parentComponents.join('/'), parentComponents);
    const node = makeNode(path, name, false, index);
    node.id = uniqueId(path);
    node.size = entry.uncompressedSize;
    node.packed = entry.compressedSize;
    node.modifiedAt = entry.modifiedAt;
    node.files = 1;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  for (const root of roots) aggregate(root);
  return roots;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function columnValue(node: ArchiveNode, column: SortColumn): number {
  switch (column) {
    case 'size':
      return node.size;
    case 'packed':
      return node.packed;
    case 'ratio':
      return savingRatio(node.size, node.packed) ?? -1;
    case 'modified':
      return node.modifiedAt;
    case 'name':
      return 0;
  }
}

/**
 * Folders come before files whatever the sort, because a tree in which they
 * interleave is unreadable. Ties fall back to the path so the order is stable.
 * `by` says which text the alphabetical sort reads: the name inside the tree,
 * the whole path in a flat list of search hits, where that is what is printed.
 */
export function compareNodes(
  a: ArchiveNode,
  b: ArchiveNode,
  sort: SortState,
  by: 'name' | 'path' = 'name',
): number {
  if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
  const direction = sort.direction === 'asc' ? 1 : -1;
  if (sort.column !== 'name') {
    const difference = columnValue(a, sort.column) - columnValue(b, sort.column);
    if (difference !== 0) return difference * direction;
  }
  const byLabel = collator.compare(a[by], b[by]);
  if (byLabel !== 0) return byLabel * direction;
  return collator.compare(a.path, b.path) * direction;
}

export interface ArchiveRow {
  node: ArchiveNode;
  /** How far to indent: 0 at the top of the archive, and 0 for every search hit. */
  depth: number;
  /** The name to print — the full path while searching, so a hit reads on its own. */
  label: string;
  expanded: boolean;
}

export interface RowOptions {
  expanded: ReadonlySet<string>;
  sort: SortState;
  /** When set, folders drop away and every matching file is listed flat. */
  query?: string;
}

function walkFiles(nodes: readonly ArchiveNode[], out: ArchiveNode[]): void {
  for (const node of nodes) {
    if (node.isDirectory) walkFiles(node.children, out);
    else out.push(node);
  }
}

/** Every file in the tree, in tree order. */
export function allFiles(tree: readonly ArchiveNode[]): ArchiveNode[] {
  const out: ArchiveNode[] = [];
  walkFiles(tree, out);
  return out;
}

/** The rows the table draws, in the order it draws them. */
export function visibleRows(tree: readonly ArchiveNode[], options: RowOptions): ArchiveRow[] {
  const query = options.query?.trim().toLowerCase() ?? '';
  if (query !== '') {
    return allFiles(tree)
      .filter((node) => node.path.toLowerCase().includes(query))
      .sort((a, b) => compareNodes(a, b, options.sort, 'path'))
      .map((node) => ({ node, depth: 0, label: node.path, expanded: false }));
  }

  const rows: ArchiveRow[] = [];
  const push = (nodes: readonly ArchiveNode[], depth: number) => {
    for (const node of [...nodes].sort((a, b) => compareNodes(a, b, options.sort))) {
      const expanded = node.isDirectory && options.expanded.has(node.id);
      rows.push({ node, depth, label: node.name, expanded });
      if (expanded) push(node.children, depth + 1);
    }
  };
  push(tree, 0);
  return rows;
}

/** Every folder id in the tree, for Expand All. */
export function folderIds(tree: readonly ArchiveNode[]): string[] {
  const out: string[] = [];
  const walk = (nodes: readonly ArchiveNode[]) => {
    for (const node of nodes) {
      if (!node.isDirectory) continue;
      out.push(node.id);
      walk(node.children);
    }
  };
  walk(tree);
  return out;
}

/** What an archive should show when it opens: everything, unless that is a wall. */
export function initialExpanded(tree: readonly ArchiveNode[], entryCount: number): Set<string> {
  return new Set(entryCount <= EXPAND_LIMIT ? folderIds(tree) : []);
}

/** Every node in the tree, by id. */
export function nodeIndex(tree: readonly ArchiveNode[]): Map<string, ArchiveNode> {
  const map = new Map<string, ArchiveNode>();
  const walk = (nodes: readonly ArchiveNode[]) => {
    for (const node of nodes) {
      map.set(node.id, node);
      if (node.isDirectory) walk(node.children);
    }
  };
  walk(tree);
  return map;
}

/**
 * The archive entries a selection stands for: the selected files, plus
 * everything inside a selected folder, each listed once and in archive order.
 */
export function selectedEntries(tree: readonly ArchiveNode[], ids: ReadonlySet<string>): number[] {
  const index = nodeIndex(tree);
  const found = new Set<number>();
  const take = (node: ArchiveNode) => {
    if (node.entry >= 0) found.add(node.entry);
    for (const child of node.children) take(child);
  };
  for (const id of ids) {
    const node = index.get(id);
    if (node) take(node);
  }
  return [...found].sort((a, b) => a - b);
}
