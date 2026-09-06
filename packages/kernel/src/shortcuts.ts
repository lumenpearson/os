/**
 * Keyboard shortcut parsing and matching. "Mod" resolves to Ctrl on
 * Windows/Linux and Cmd on macOS unless the user overrides it in Settings.
 */

export interface ParsedShortcut {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  shift: boolean;
  mod: boolean;
}

export type ModifierPreference = 'auto' | 'ctrl' | 'meta';

const KEY_ALIASES: Record<string, string> = {
  esc: 'escape',
  return: 'enter',
  space: ' ',
  plus: '+',
  minus: '-',
  comma: ',',
  period: '.',
  slash: '/',
  backquote: '`',
  del: 'delete',
  up: 'arrowup',
  down: 'arrowdown',
  left: 'arrowleft',
  right: 'arrowright',
};

export function parseShortcut(keys: string): ParsedShortcut {
  const parts = keys.split('+').map((p) => p.trim());
  const out: ParsedShortcut = {
    key: '',
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
    mod: false,
  };
  for (const raw of parts) {
    const p = raw.toLowerCase();
    if (p === 'mod' || p === 'cmdorctrl') out.mod = true;
    else if (p === 'ctrl' || p === 'control') out.ctrl = true;
    else if (p === 'meta' || p === 'cmd' || p === 'command' || p === 'win' || p === 'super')
      out.meta = true;
    else if (p === 'alt' || p === 'option') out.alt = true;
    else if (p === 'shift') out.shift = true;
    else out.key = KEY_ALIASES[p] ?? p;
  }
  return out;
}

export function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = nav.userAgentData?.platform ?? navigator.platform ?? '';
  return /mac|iphone|ipad/i.test(platform);
}

export function modIsMeta(pref: ModifierPreference = 'auto'): boolean {
  if (pref === 'meta') return true;
  if (pref === 'ctrl') return false;
  return isMacLike();
}

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  /**
   * The physical key, where the caller has one. Needed because `key` carries
   * the shifted glyph — Shift+8 arrives as '*' — so a Shift chord naming a
   * digit or a punctuation mark can only be recognised by position.
   */
  code?: string;
}

export function matchesShortcut(
  event: KeyLike,
  keys: string,
  pref: ModifierPreference = 'auto',
): boolean {
  const s = parseShortcut(keys);
  const useMeta = modIsMeta(pref);
  const wantCtrl = s.ctrl || (s.mod && !useMeta);
  const wantMeta = s.meta || (s.mod && useMeta);
  if (event.ctrlKey !== wantCtrl) return false;
  if (event.metaKey !== wantMeta) return false;
  if (event.altKey !== s.alt) return false;
  if (event.shiftKey !== s.shift) return false;
  const key = event.key.toLowerCase();
  if (key === s.key || (s.key.length === 1 && key === s.key.toLowerCase())) return true;
  // With Shift held, `event.key` carries the shifted glyph: '8' arrives as '*'
  // and '.' as '>'. Letters survive because case folds away, but every
  // Shift+digit and Shift+punctuation chord would otherwise be unmatchable.
  // The physical key is what the chord names, so fall back to `event.code`.
  return s.shift && codeMatches(event.code, s.key);
}

/** Digit and punctuation `KeyboardEvent.code` values, by the glyph they print unshifted. */
const CODE_FOR_KEY: Record<string, string> = {
  '0': 'Digit0',
  '1': 'Digit1',
  '2': 'Digit2',
  '3': 'Digit3',
  '4': 'Digit4',
  '5': 'Digit5',
  '6': 'Digit6',
  '7': 'Digit7',
  '8': 'Digit8',
  '9': 'Digit9',
  '-': 'Minus',
  '=': 'Equal',
  '[': 'BracketLeft',
  ']': 'BracketRight',
  '\\': 'Backslash',
  ';': 'Semicolon',
  "'": 'Quote',
  ',': 'Comma',
  '.': 'Period',
  '/': 'Slash',
  '`': 'Backquote',
};

function codeMatches(code: string | undefined, key: string): boolean {
  if (!code || key.length !== 1) return false;
  return CODE_FOR_KEY[key] === code;
}

/** Human-readable label: "Mod+Shift+S" → "⌘⇧S" on macOS, "Ctrl+Shift+S" elsewhere. */
export function formatShortcut(keys: string, pref: ModifierPreference = 'auto'): string {
  const s = parseShortcut(keys);
  const mac = modIsMeta(pref);
  const parts: string[] = [];
  if (mac) {
    if (s.ctrl) parts.push('⌃');
    if (s.alt) parts.push('⌥');
    if (s.shift) parts.push('⇧');
    if (s.mod || s.meta) parts.push('⌘');
    parts.push(prettyKey(s.key, true));
    return parts.join('');
  }
  if (s.mod || s.ctrl) parts.push('Ctrl');
  if (s.meta) parts.push('Win');
  if (s.alt) parts.push('Alt');
  if (s.shift) parts.push('Shift');
  // A chord can be a modifier on its own — the Start menu is bound to Meta —
  // and then there is no key to print. Pushing an empty string would render
  // "Win+" with nothing after the separator.
  const label = prettyKey(s.key, false);
  if (label) parts.push(label);
  return parts.join('+');
}

function prettyKey(key: string, mac: boolean): string {
  switch (key) {
    case 'arrowup':
      return '↑';
    case 'arrowdown':
      return '↓';
    case 'arrowleft':
      return '←';
    case 'arrowright':
      return '→';
    case 'escape':
      return mac ? '⎋' : 'Esc';
    case 'enter':
      // U+21A9 is the Return glyph macOS prints in its own menus, not an
      // emoji. Windows and Linux get the word.
      // deslop-ignore-next-line 15
      return mac ? '↩' : 'Enter';
    case 'backspace':
      return mac ? '⌫' : 'Backspace';
    case 'delete':
      return mac ? '⌦' : 'Del';
    case 'tab':
      return mac ? '⇥' : 'Tab';
    case ' ':
      return 'Space';
    default:
      return key.length === 1 ? key.toUpperCase() : key.charAt(0).toUpperCase() + key.slice(1);
  }
}

/** Global shortcuts the shell binds. Users may override keys in Settings → Keyboard. */
export const GLOBAL_SHORTCUTS = {
  'shell.spotlight': { keys: 'Mod+Space', label: 'Search' },
  'shell.startMenu': { keys: 'Meta', label: 'Start menu' },
  'shell.switchWindow': { keys: 'Alt+Tab', label: 'Switch window' },
  'shell.switchWindowBack': { keys: 'Alt+Shift+Tab', label: 'Switch window (back)' },
  'shell.missionControl': { keys: 'Mod+Alt+ArrowUp', label: 'Show all windows' },
  'shell.showDesktop': { keys: 'Mod+Alt+D', label: 'Show desktop' },
  'shell.lock': { keys: 'Mod+Alt+L', label: 'Lock screen' },
  'shell.notifications': { keys: 'Mod+Alt+N', label: 'Notification center' },
  'shell.controlCenter': { keys: 'Mod+Alt+C', label: 'Control center' },
  'shell.terminal': { keys: 'Mod+Alt+T', label: 'Open Terminal' },
  'shell.files': { keys: 'Mod+Alt+E', label: 'Open Files' },
  'shell.settings': { keys: 'Mod+Alt+Comma', label: 'Open Settings' },
  'shell.taskManager': { keys: 'Mod+Shift+Escape', label: 'Task Manager' },
  'window.close': { keys: 'Mod+W', label: 'Close window' },
  'window.quit': { keys: 'Mod+Q', label: 'Quit app' },
  'window.minimize': { keys: 'Mod+M', label: 'Minimize' },
  'window.maximize': { keys: 'Mod+Alt+F', label: 'Maximize' },
  'window.snapLeft': { keys: 'Meta+ArrowLeft', label: 'Snap left' },
  'window.snapRight': { keys: 'Meta+ArrowRight', label: 'Snap right' },
  'window.snapTop': { keys: 'Meta+ArrowUp', label: 'Maximize / snap top' },
  'window.snapDown': { keys: 'Meta+ArrowDown', label: 'Restore / minimize' },
} as const;

export type GlobalShortcutId = keyof typeof GLOBAL_SHORTCUTS;
