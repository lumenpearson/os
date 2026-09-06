/**
 * The keys a media player is expected to answer, kept apart from the DOM so
 * the mapping can be read and tested in one place. Modified keys (Ctrl, Cmd,
 * Alt) fall through to the menubar shortcuts, and keys aimed at a control that
 * already handles them — a slider, a button, a text field — are left alone.
 */

export const SEEK_STEP = 5;
export const SEEK_STEP_LARGE = 30;
export const VOLUME_STEP = 0.05;

export type MediaCommand =
  | { type: 'toggle' }
  | { type: 'seek'; delta: number }
  | { type: 'volume'; delta: number }
  | { type: 'mute' }
  | { type: 'fullscreen' }
  | { type: 'next' }
  | { type: 'previous' }
  | { type: 'fraction'; value: number };

export interface KeyLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export function commandForKey(event: KeyLike): MediaCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const big = event.shiftKey === true;
  switch (event.key) {
    case ' ':
    case 'Spacebar':
      return { type: 'toggle' };
    case 'ArrowLeft':
      return { type: 'seek', delta: -(big ? SEEK_STEP_LARGE : SEEK_STEP) };
    case 'ArrowRight':
      return { type: 'seek', delta: big ? SEEK_STEP_LARGE : SEEK_STEP };
    case 'ArrowUp':
      return { type: 'volume', delta: VOLUME_STEP };
    case 'ArrowDown':
      return { type: 'volume', delta: -VOLUME_STEP };
  }
  const key = event.key.toLowerCase();
  if (key === 'm') return { type: 'mute' };
  if (key === 'f') return { type: 'fullscreen' };
  if (key === 'n') return { type: 'next' };
  if (key === 'p') return { type: 'previous' };
  if (key.length === 1 && key >= '0' && key <= '9') {
    return { type: 'fraction', value: Number(key) / 10 };
  }
  return null;
}

const CONTROL_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'OPTION']);
const CONTROL_ROLES = new Set(['slider', 'textbox', 'listbox', 'option', 'menuitem', 'combobox']);

/** True when the focused element owns these keys itself. */
export function isControlTarget(target: unknown): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as {
    tagName?: unknown;
    isContentEditable?: unknown;
    getAttribute?: (name: string) => string | null;
  };
  if (el.isContentEditable === true) return true;
  if (typeof el.tagName === 'string' && CONTROL_TAGS.has(el.tagName.toUpperCase())) return true;
  const role = typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
  return typeof role === 'string' && CONTROL_ROLES.has(role);
}
