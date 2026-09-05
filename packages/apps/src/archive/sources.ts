/**
 * Turning what the user picked into what goes in a new archive.
 *
 * A pick is a list of files and folders from anywhere in the file system, so
 * two of them can share a name and one can sit inside another. Both are
 * settled here, before anything is read: a path already covered by another
 * pick is dropped, and a name already taken at the top of the archive is
 * given a suffix. Everything below a root then keeps its path relative to
 * that root, so `Photos/2024/a.png` stays where it was.
 */

import { basename, isInside, normalize, relative, uniqueName } from '@lumen/vfs';

export interface SourceRoot {
  /** The path that was picked. */
  path: string;
  /** What it is called at the top of the archive. */
  name: string;
}

/** Drop duplicates and nested picks, then make the top-level names unique. */
export function planRoots(paths: readonly string[]): SourceRoot[] {
  const cleaned: string[] = [];
  for (const raw of paths) {
    const path = normalize(raw);
    if (path === '/' || basename(path) === '') continue;
    if (!cleaned.includes(path)) cleaned.push(path);
  }
  const kept = cleaned.filter((path) => !cleaned.some((other) => isInside(other, path)));

  const taken = new Set<string>();
  return kept.map((path) => {
    const name = uniqueName(basename(path), (candidate) => taken.has(candidate));
    taken.add(name);
    return { path, name };
  });
}

/** Where a walked path lands inside the archive. */
export function entryNameFor(root: SourceRoot, path: string): string {
  const target = normalize(path);
  const from = normalize(root.path);
  if (target === from) return root.name;
  if (!isInside(from, target)) return `${root.name}/${basename(target)}`;
  return `${root.name}/${relative(from, target)}`;
}

/** The name the Save dialog opens on. */
export function suggestArchiveName(roots: readonly SourceRoot[]): string {
  const only = roots.length === 1 ? roots[0] : undefined;
  return only ? `${only.name}.zip` : 'Archive.zip';
}
