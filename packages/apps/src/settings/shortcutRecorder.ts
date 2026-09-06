/**
 * Turns a keydown into the "Mod+Shift+K" notation the kernel parses
 * (`parseShortcut`). Ctrl or Meta becomes "Mod" when it is the key the user
 * chose as their primary modifier; the other one stays literal.
 */

export interface RecordableKey {
  key: string;
  code?: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export type RecordResult =
  | { type: 'keys'; keys: string }
  /** A lone modifier or a dead key: keep waiting. */
  | { type: 'ignore' }
  /** Escape on its own. */
  | { type: 'cancel' };

const MODIFIER_KEYS = new Set([
  'control',
  'shift',
  'alt',
  'meta',
  'os',
  'altgraph',
  'capslock',
  'fn',
  'fnlock',
  'hyper',
  'super',
  'symbol',
  'numlock',
  'scrolllock',
]);

const UNUSABLE_KEYS = new Set(['dead', 'unidentified', 'process', 'compose']);

const NAMED_KEYS: Record<string, string> = {
  ' ': 'Space',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '-': 'Minus',
  '+': 'Plus',
  '`': 'Backquote',
};

export function isModifierKey(key: string): boolean {
  return MODIFIER_KEYS.has(key.toLowerCase());
}

/**
 * The key part of a shortcut. Letters and digits come from `code` so that
 * Alt-modified keys on macOS (⌥A → "å") and non-Latin layouts still record
 * the physical key.
 */
export function keyToken(e: Pick<RecordableKey, 'key' | 'code'>): string | null {
  const code = e.code ?? '';
  const letter = /^Key([A-Z])$/.exec(code);
  if (letter?.[1]) return letter[1];
  const digit = /^Digit(\d)$/.exec(code);
  if (digit?.[1]) return digit[1];

  const key = e.key;
  if (!key || UNUSABLE_KEYS.has(key.toLowerCase()) || isModifierKey(key)) return null;
  const named = NAMED_KEYS[key];
  if (named) return named;
  if (key.length === 1) return key.toUpperCase();
  return key;
}

export function recordKey(e: RecordableKey, options: { modIsMeta: boolean }): RecordResult {
  const hasModifier = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
  if (e.key === 'Escape' && !hasModifier) return { type: 'cancel' };
  const token = keyToken(e);
  if (!token) return { type: 'ignore' };

  const parts: string[] = [];
  const modFromMeta = options.modIsMeta;
  if (modFromMeta ? e.metaKey : e.ctrlKey) parts.push('Mod');
  if (modFromMeta ? e.ctrlKey : false) parts.push('Ctrl');
  if (!modFromMeta && e.metaKey) parts.push('Meta');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(token);
  return { type: 'keys', keys: parts.join('+') };
}

/** Canonical form for comparing two bindings ("shift+mod+k" equals "Mod+Shift+K"). */
export function canonicalKeys(keys: string): string {
  return keys
    .split('+')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
    .sort()
    .join('+');
}

/** The id of another action already bound to `keys`, if any. */
export function findConflict(
  keys: string,
  selfId: string,
  bindings: Record<string, string>,
): string | null {
  const wanted = canonicalKeys(keys);
  for (const [id, k] of Object.entries(bindings)) {
    if (id !== selfId && canonicalKeys(k) === wanted) return id;
  }
  return null;
}
