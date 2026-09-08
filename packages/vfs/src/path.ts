/**
 * POSIX-style path helpers for the virtual file system. Every VFS path is
 * absolute, uses `/` separators, and never contains `.` or `..` segments after
 * normalisation. Host paths (Windows) are never exposed above the adapter.
 */

export const SEP = '/';

export function normalize(input: string): string {
  const absolute = input.startsWith(SEP);
  const out: string[] = [];
  for (const part of input.split(/[\\/]+/)) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      out.pop();
      continue;
    }
    out.push(part);
  }
  const joined = out.join(SEP);
  return absolute || joined === '' ? `${SEP}${joined}` : joined;
}

export function join(...parts: string[]): string {
  return normalize(parts.filter((p) => p.length > 0).join(SEP));
}

export function resolve(base: string, target: string): string {
  if (target.startsWith(SEP)) return normalize(target);
  return join(base, target);
}

export function isAbsolute(path: string): boolean {
  return path.startsWith(SEP);
}

export function dirname(path: string): string {
  const n = normalize(path);
  if (n === SEP) return SEP;
  const idx = n.lastIndexOf(SEP);
  return idx <= 0 ? SEP : n.slice(0, idx);
}

export function basename(path: string, stripExt = false): string {
  const n = normalize(path);
  if (n === SEP) return '';
  const name = n.slice(n.lastIndexOf(SEP) + 1);
  if (!stripExt) return name;
  const ext = extname(name);
  return ext ? name.slice(0, -ext.length) : name;
}

/** Extension including the dot, lower-cased. `"a.tar.gz"` → `".gz"`; dotfiles → `""`. */
export function extname(path: string): string {
  const name = basename(path);
  const idx = name.lastIndexOf('.');
  if (idx <= 0) return '';
  return name.slice(idx).toLowerCase();
}

export function segments(path: string): string[] {
  const n = normalize(path);
  return n === SEP ? [] : n.slice(1).split(SEP);
}

/** True if `child` is inside `parent` (strictly, or equal when `inclusive`). */
export function isInside(parent: string, child: string, inclusive = false): boolean {
  const p = normalize(parent);
  const c = normalize(child);
  if (p === c) return inclusive;
  const prefix = p === SEP ? SEP : `${p}${SEP}`;
  return c.startsWith(prefix);
}

export function relative(from: string, to: string): string {
  const f = segments(from);
  const t = segments(to);
  let i = 0;
  while (i < f.length && i < t.length && f[i] === t[i]) i++;
  const ups = f.slice(i).map(() => '..');
  return [...ups, ...t.slice(i)].join(SEP) || '.';
}

/** Ancestors from root to the path itself: "/a/b" → ["/", "/a", "/a/b"]. */
export function ancestors(path: string): string[] {
  const segs = segments(path);
  const out = [SEP];
  let cur = '';
  for (const s of segs) {
    cur = `${cur}${SEP}${s}`;
    out.push(cur);
  }
  return out;
}

/** Produce "name", "name 2", "name 3"… until `taken` reports it free. */
export function uniqueName(name: string, taken: (candidate: string) => boolean): string {
  if (!taken(name)) return name;
  const ext = extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${stem} ${i}${ext}`;
    if (!taken(candidate)) return candidate;
  }
  return `${stem} ${Date.now()}${ext}`;
}

// Characters that are illegal on Windows or ambiguous in a path: separators,
// reserved punctuation, and ASCII control characters. The control range is the
// point of the check — Windows rejects those bytes in a file name.
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the intent
const INVALID_NAME = /[\\/:*?"<>|\u0000-\u001f]/;

export function isValidName(name: string): boolean {
  if (name.length === 0 || name.length > 255) return false;
  if (name === '.' || name === '..') return false;
  if (INVALID_NAME.test(name)) return false;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i.test(name)) return false;
  if (name.endsWith(' ') || name.endsWith('.')) return false;
  return true;
}
