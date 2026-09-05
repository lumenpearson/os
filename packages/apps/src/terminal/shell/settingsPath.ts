/**
 * Reading and writing a setting by its path, for `lumenctl`.
 *
 * A path is the dotted route to a leaf: `appearance.accent`, `taskbar.size`.
 * Writing is deliberately conservative — the value has to parse to the type
 * the setting already holds, or nothing is written. A settings store that
 * accepts "true" where a number belongs is a settings store that breaks the
 * interface from the terminal, which is exactly what this is for.
 */

export type Leaf = string | number | boolean | string[] | null;

export interface PathError {
  ok: false;
  error: string;
}

export interface PathValue {
  ok: true;
  value: Leaf;
}

/** Every leaf path in an object, in the order a person would read them. */
export function settingsPaths(settings: object, prefix = ''): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(settings)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      paths.push(...settingsPaths(value as object, path));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

/** The value at a path, or an error naming the path that does not exist. */
export function readPath(settings: object, path: string): PathValue | PathError {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return { ok: false, error: 'no setting named ""' };
  let node: unknown = settings;
  for (const part of parts) {
    if (node === null || typeof node !== 'object' || !(part in node)) {
      return { ok: false, error: `no setting named "${path}"` };
    }
    node = (node as Record<string, unknown>)[part];
  }
  if (node !== null && typeof node === 'object' && !Array.isArray(node)) {
    return { ok: false, error: `"${path}" is a section, not a setting` };
  }
  return { ok: true, value: node as Leaf };
}

/**
 * Read a written value as the type the setting already holds. Arrays are
 * comma-separated; a leaf that is currently null accepts anything scalar.
 */
export function parseValue(current: Leaf, text: string): PathValue | PathError {
  if (Array.isArray(current)) {
    const items = text
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    return { ok: true, value: items };
  }
  if (typeof current === 'boolean') {
    if (text === 'true' || text === 'on' || text === '1') return { ok: true, value: true };
    if (text === 'false' || text === 'off' || text === '0') return { ok: true, value: false };
    return { ok: false, error: `expected true or false, got "${text}"` };
  }
  if (typeof current === 'number') {
    const value = Number(text);
    if (!Number.isFinite(value)) return { ok: false, error: `expected a number, got "${text}"` };
    return { ok: true, value };
  }
  if (current === null && (text === 'null' || text === '')) return { ok: true, value: null };
  return { ok: true, value: text };
}

/** How a value is printed back: quoted strings would be noise in a terminal. */
export function formatValue(value: Leaf): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}
