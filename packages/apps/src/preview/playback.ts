/**
 * The media controls without the DOM: which command a key press means, and
 * the arithmetic behind seeking, the volume and the speaker glyph. A media
 * element reports `NaN` for the duration until its metadata arrives and
 * `Infinity` for a stream, so nothing here trusts a duration it was handed.
 */

/** Seconds an arrow key moves, and what Shift makes it. */
export const SEEK_STEP = 5;
export const SEEK_STEP_LARGE = 30;

/** Fraction of full volume one key press moves. */
export const VOLUME_STEP = 0.1;

export type PlaybackCommand =
  | { type: 'toggle' }
  | { type: 'seek'; delta: number }
  | { type: 'volume'; delta: number }
  | { type: 'mute' }
  | { type: 'start' }
  | { type: 'end' };

export interface KeyLike {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/**
 * Keys the player answers while it has focus. A modified key belongs to the
 * menubar, so it is left alone.
 */
export function playbackCommand(event: KeyLike): PlaybackCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const far = event.shiftKey === true;
  switch (event.key) {
    case ' ':
    case 'Spacebar':
      return { type: 'toggle' };
    case 'ArrowLeft':
      return { type: 'seek', delta: -(far ? SEEK_STEP_LARGE : SEEK_STEP) };
    case 'ArrowRight':
      return { type: 'seek', delta: far ? SEEK_STEP_LARGE : SEEK_STEP };
    case 'ArrowUp':
      return { type: 'volume', delta: VOLUME_STEP };
    case 'ArrowDown':
      return { type: 'volume', delta: -VOLUME_STEP };
    case 'Home':
      return { type: 'start' };
    case 'End':
      return { type: 'end' };
    default:
      break;
  }
  return event.key.toLowerCase() === 'm' ? { type: 'mute' } : null;
}

/** Elements that answer the transport keys themselves. */
const KEY_OWNING_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'OPTION']);

/**
 * True when the key press belongs to the control it landed on: the space bar
 * on the play button is that button being pressed, not a second play command.
 */
export function ownsKeys(target: unknown): boolean {
  if (typeof target !== 'object' || target === null) return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  if (el.isContentEditable === true) return true;
  return typeof el.tagName === 'string' && KEY_OWNING_TAGS.has(el.tagName.toUpperCase());
}

/** True when the duration is a number a seek bar can be drawn against. */
export function isSeekable(duration: number): boolean {
  return Number.isFinite(duration) && duration > 0;
}

/** A position inside the media, never past either end. */
export function clampTime(time: number, duration: number): number {
  if (!Number.isFinite(time) || time <= 0) return 0;
  if (!isSeekable(duration)) return time;
  return Math.min(duration, time);
}

export function seekBy(current: number, delta: number, duration: number): number {
  return clampTime((Number.isFinite(current) ? current : 0) + delta, duration);
}

/** Volume as the element wants it: 0 to 1, two decimals so 0.1 steps land. */
export function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.round(Math.min(1, Math.max(0, volume)) * 100) / 100;
}

export type VolumeLevel = 'muted' | 'low' | 'high';

/** Which speaker glyph the volume button shows. */
export function volumeLevel(volume: number, muted: boolean): VolumeLevel {
  const level = clampVolume(volume);
  if (muted || level === 0) return 'muted';
  return level < 0.5 ? 'low' : 'high';
}
