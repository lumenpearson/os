/**
 * Entry-name safety — the one thing in this app that must not be wrong.
 *
 * Nothing in the ZIP format stops an archive from naming an entry
 * `../../etc/passwd`, `/etc/passwd` or `C:\Windows\system32\x`. An extractor
 * that joins such a name onto the destination writes outside it; that is the
 * zip-slip vulnerability. So no name from an archive is ever used as a path.
 * It is taken apart into components, each component is made into something the
 * VFS will accept, and anything that would climb out is dropped:
 *
 *   - `\` counts as a separator, which also disarms Windows drive paths;
 *   - a leading drive letter (`C:`) is removed;
 *   - `.` and `..` components are dropped rather than resolved, so a crafted
 *     name can never cancel a directory the destination actually contains;
 *   - characters the VFS rejects become `_`, and trailing dots and spaces are
 *     trimmed, because Windows will not store a name that ends in either;
 *   - a name that has nothing left after all that is refused outright.
 *
 * `extractionPath` then re-checks the joined result against the destination,
 * so a hole in the rules above still cannot produce a write outside it.
 */

import { isInside, join, normalize } from '@lumen/vfs';

/** Separators, characters Windows forbids, and the ASCII control range. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching the control range is the point
const INVALID_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

/** MS-DOS device names, which Windows still refuses as file names. */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

const MAX_COMPONENT = 255;

/** Trailing dots and spaces are legal in a ZIP name and illegal on Windows. */
function trimTail(value: string): string {
  let end = value.length;
  while (end > 0 && (value[end - 1] === '.' || value[end - 1] === ' ')) end -= 1;
  return value.slice(0, end);
}

/**
 * One path component made safe, or `null` when nothing usable is left —
 * `.`, `..`, the empty string, and a component of nothing but dots.
 */
export function sanitizeComponent(raw: string): string | null {
  if (raw === '' || raw === '.' || raw === '..') return null;
  let name = trimTail(raw.replace(INVALID_CHARS, '_'));
  if (name.length > MAX_COMPONENT) name = trimTail(name.slice(0, MAX_COMPONENT));
  if (name === '' || name === '.' || name === '..') return null;
  return RESERVED.test(name) ? `_${name}` : name;
}

/**
 * An archive entry name reduced to a relative path that cannot leave its
 * destination, or `null` when the name carries no usable component at all.
 * A trailing slash (the ZIP convention for a directory) is not preserved;
 * the entry's own directory flag says what it is.
 */
export function sanitizeEntryName(raw: string): string | null {
  const withoutDrive = raw.replace(/\\/g, '/').replace(/^[A-Za-z]:/, '');
  const parts: string[] = [];
  for (const part of withoutDrive.split('/')) {
    const safe = sanitizeComponent(part);
    if (safe !== null) parts.push(safe);
  }
  return parts.length === 0 ? null : parts.join('/');
}

/**
 * Where an entry may be written under `destination`, or `null` if it may not
 * be written at all. The `isInside` check is deliberate redundancy: the
 * sanitiser above should already make it impossible to fail.
 */
export function extractionPath(destination: string, raw: string): string | null {
  const safe = sanitizeEntryName(raw);
  if (safe === null) return null;
  const target = join(destination, safe);
  return isInside(normalize(destination), target) ? target : null;
}

/** True when the name would be written somewhere other than where it says. */
export function isRewritten(raw: string): boolean {
  const safe = sanitizeEntryName(raw);
  return safe === null || safe !== raw.replace(/\/+$/, '');
}
