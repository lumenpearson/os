/**
 * What a drop carries.
 *
 * Two kinds of drag can land on the install target: one that started in a
 * Files window, which puts VFS paths on the transfer under the OS's own MIME
 * type, and one from outside the browser, which puts real files on it. Both
 * are read here so the component only asks "is there a manifest in this?".
 */

/** The type the Files app writes VFS paths under. */
export const LUMEN_PATHS_MIME = 'application/x-lumen-paths';

export const MANIFEST_EXTENSION = '.app';

export function isManifestName(name: string): boolean {
  return name.toLowerCase().endsWith(MANIFEST_EXTENSION);
}

/** Paths from a drag that started inside the OS. Malformed payloads are empty. */
export function parseDroppedPaths(raw: string): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((p): p is string => typeof p === 'string');
  } catch {
    return [];
  }
}

/** The first `.app` in a drop, or the first item if none of them is one. */
export function pickManifest(names: readonly string[]): string | null {
  return names.find(isManifestName) ?? names[0] ?? null;
}

/** True when the transfer holds something worth reading. */
export function hasDropPayload(types: readonly string[]): boolean {
  return types.includes(LUMEN_PATHS_MIME) || types.includes('Files');
}
