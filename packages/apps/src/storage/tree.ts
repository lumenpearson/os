/**
 * The size tree behind the folder view: a flat list of scanned files turned
 * into directories that carry the bytes below them.
 *
 * Sizes are summed, never sampled or extrapolated — a directory's size is the
 * sum of the files the scan actually read under it. Directories holding no
 * files carry no bytes and therefore have no tile; the folder view says so
 * rather than drawing an empty rectangle.
 */

import { basename, isInside, normalize, segments } from '@lumen/vfs';

export interface TreeFile {
  path: string;
  size: number;
}

export type SizeNodeKind = 'directory' | 'file' | 'bucket';

export interface SizeNode {
  /** Absolute VFS path. Buckets get the parent path with a `#more` suffix. */
  path: string;
  name: string;
  kind: SizeNodeKind;
  /** Bytes of every file at or under this node. */
  size: number;
  /** Files at or under this node. */
  files: number;
  /** Largest first; empty for files. */
  children: SizeNode[];
}

/** Suffix that marks the collapsed tail of a directory's children. */
export const BUCKET_SUFFIX = '#more';

interface Builder {
  path: string;
  name: string;
  size: number;
  files: number;
  dirs: Map<string, Builder>;
  entries: SizeNode[];
}

function builder(path: string, name: string): Builder {
  return { path, name, size: 0, files: 0, dirs: new Map(), entries: [] };
}

function toNode(node: Builder): SizeNode {
  const children = [...node.entries, ...[...node.dirs.values()].map(toNode)];
  children.sort(compareNodes);
  return {
    path: node.path,
    name: node.name,
    kind: 'directory',
    size: node.size,
    files: node.files,
    children,
  };
}

/** Largest first; equal sizes fall back to a stable, natural name order. */
export function compareNodes(a: SizeNode, b: SizeNode): number {
  if (a.size !== b.size) return b.size - a.size;
  return collator.compare(a.name, b.name);
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/**
 * Build the tree under `root`. Files outside `root` are ignored: the caller
 * scanned one directory and the tree may not claim to describe more.
 */
export function buildTree(root: string, files: Iterable<TreeFile>, rootName?: string): SizeNode {
  const rootPath = normalize(root);
  // The caller names the root, because the directory's own basename is the
  // account name and reads as gibberish in a label: Files calls this folder
  // "Home" in its breadcrumbs, and two names for one folder is worse than a
  // slightly longer signature.
  const rootNode = builder(rootPath, rootName ?? (basename(rootPath) || rootPath));
  const depth = segments(rootPath).length;
  for (const file of files) {
    const path = normalize(file.path);
    if (!isInside(rootPath, path)) continue;
    const parts = segments(path).slice(depth);
    const name = parts[parts.length - 1];
    if (name === undefined) continue;
    const size = Number.isFinite(file.size) && file.size > 0 ? file.size : 0;
    let node = rootNode;
    node.size += size;
    node.files += 1;
    let prefix = rootPath === '/' ? '' : rootPath;
    for (const part of parts.slice(0, -1)) {
      prefix = `${prefix}/${part}`;
      let next = node.dirs.get(part);
      if (!next) {
        next = builder(prefix, part);
        node.dirs.set(part, next);
      }
      next.size += size;
      next.files += 1;
      node = next;
    }
    node.entries.push({
      path,
      name,
      kind: 'file',
      size,
      files: 1,
      children: [],
    });
  }
  return toNode(rootNode);
}

export interface CollapseOptions {
  /** Children smaller than this share of the parent join the bucket. */
  minShare?: number;
  /** Never draw more than this many tiles. */
  maxChildren?: number;
}

const DEFAULT_MIN_SHARE = 0.012;
const DEFAULT_MAX_CHILDREN = 60;

/**
 * Replace the tail of a directory's children with one "…and N more" bucket.
 *
 * A tile thinner than a hairline says nothing, and a hundred of them say
 * nothing loudly. One child on its own is never collapsed: naming it costs
 * the same space as hiding it.
 */
export function collapseSmall(node: SizeNode, options: CollapseOptions = {}): SizeNode {
  const minShare = options.minShare ?? DEFAULT_MIN_SHARE;
  const maxChildren = options.maxChildren ?? DEFAULT_MAX_CHILDREN;
  const children = node.children;
  if (children.length === 0) return node;
  const floor = node.size * minShare;
  let keep = 0;
  while (keep < children.length && keep < maxChildren) {
    const child = children[keep];
    if (child === undefined) break;
    if (keep > 0 && child.size < floor) break;
    keep++;
  }
  const rest = children.slice(keep);
  if (rest.length <= 1) return node;
  const bucket: SizeNode = {
    path: `${node.path}${BUCKET_SUFFIX}`,
    name: `…and ${rest.length} more`,
    kind: 'bucket',
    size: rest.reduce((sum, c) => sum + c.size, 0),
    files: rest.reduce((sum, c) => sum + c.files, 0),
    children: [],
  };
  return { ...node, children: [...children.slice(0, keep), bucket] };
}

/** The node at `path`, or null when the tree does not hold it. */
export function findNode(root: SizeNode, path: string): SizeNode | null {
  const target = normalize(path);
  if (target === root.path) return root;
  if (!isInside(root.path, target)) return null;
  for (const child of root.children) {
    if (child.path === target) return child;
    if (child.kind === 'directory' && isInside(child.path, target)) return findNode(child, target);
  }
  return null;
}

/** Root first, then every node down to `path`. Empty when the path is absent. */
export function trailTo(root: SizeNode, path: string): SizeNode[] {
  const target = normalize(path);
  if (!isInside(root.path, target, true)) return [];
  const trail: SizeNode[] = [root];
  let node = root;
  while (node.path !== target) {
    const next = node.children.find(
      (child) => child.kind === 'directory' && isInside(child.path, target, true),
    );
    if (!next) return node.path === target ? trail : [];
    trail.push(next);
    node = next;
  }
  return trail;
}

/** Every file in the tree, largest first. */
export function largestFiles<T extends TreeFile>(files: readonly T[], limit: number): T[] {
  return [...files].sort((a, b) => b.size - a.size || a.path.localeCompare(b.path)).slice(0, limit);
}
