/**
 * The playlist: what is queued, what plays next, and how the order changes.
 *
 * Shuffle is a permutation of the queue rather than a random pick each time,
 * so a shuffled pass plays every track once before any track repeats. The
 * permutation is derived from `seed` with a small deterministic generator, so
 * the same seed always produces the same order and the tests can assert it.
 *
 * `step()` answers "what should play next"; `queueReducer()` owns the data.
 * Keeping them apart lets the player act on an outcome (stop at the end,
 * restart the current track) that a reducer cannot express in state alone.
 */
import { basename, extname } from '@lumen/vfs';
import { clamp, RESTART_WINDOW } from './time';

export type MediaKind = 'audio' | 'video';

export const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.opus'] as const;

export const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogv', '.mov', '.m4v'] as const;

export const MEDIA_EXTENSIONS: string[] = [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS];

/** The kind a file claims by its extension, or null when it is not media. */
export function mediaKind(path: string): MediaKind | null {
  const ext = extname(path).toLowerCase();
  if ((AUDIO_EXTENSIONS as readonly string[]).includes(ext)) return 'audio';
  if ((VIDEO_EXTENSIONS as readonly string[]).includes(ext)) return 'video';
  return null;
}

export interface Track {
  path: string;
  /** File name; the player never claims to know a title beyond this. */
  name: string;
  kind: MediaKind;
}

export function trackFor(path: string): Track | null {
  const kind = mediaKind(path);
  if (!kind) return null;
  return { path, name: basename(path), kind };
}

export function tracksFor(paths: readonly string[]): Track[] {
  const out: Track[] = [];
  for (const p of paths) {
    const t = trackFor(p);
    if (t) out.push(t);
  }
  return out;
}

export type LoopMode = 'off' | 'one' | 'all';

export interface QueueState {
  tracks: Track[];
  /** Index into `tracks`, or -1 when nothing is loaded. */
  index: number;
  loop: LoopMode;
  shuffle: boolean;
  /** Seed of the current shuffled pass. */
  seed: number;
}

export const EMPTY_QUEUE: QueueState = {
  tracks: [],
  index: -1,
  loop: 'off',
  shuffle: false,
  seed: 1,
};

export function currentTrack(state: QueueState): Track | null {
  return state.tracks[state.index] ?? null;
}

/** mulberry32 — small, fast, and identical across runs. */
function generator(seed: number): () => number {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The seed of the next shuffled pass. */
export function nextSeed(seed: number): number {
  const mixed = Math.imul((seed >>> 0) ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return mixed || 1;
}

/** A permutation of `0…count-1`, stable for a given seed. */
export function shuffleOrder(count: number, seed: number): number[] {
  const order = Array.from({ length: Math.max(0, Math.floor(count)) }, (_, i) => i);
  const random = generator(seed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = order[i] as number;
    const b = order[j] as number;
    order[i] = b;
    order[j] = a;
  }
  return order;
}

/** Track indices in the order they will play. */
export function playbackOrder(state: QueueState): number[] {
  const n = state.tracks.length;
  if (!state.shuffle) return Array.from({ length: n }, (_, i) => i);
  return shuffleOrder(n, state.seed);
}

export interface StepResult {
  /** What to play next; null means playback stops here. */
  index: number | null;
  /** Play `index` again from the start rather than loading a new track. */
  restart: boolean;
  /** Seed to store: a shuffled pass that wrapped starts a new permutation. */
  seed: number;
}

export interface StepOptions {
  /** The track ended by itself rather than the listener asking for the next one. */
  auto?: boolean;
  /** Seconds played, so Previous restarts a track that is already under way. */
  elapsed?: number;
}

/**
 * Where playback goes when the listener (or the end of a track) asks to move.
 * Loop `off` stops at the ends; `all` and `one` wrap; `one` repeats the
 * current track when it ends on its own but still steps when asked to.
 */
export function step(state: QueueState, direction: 1 | -1, options: StepOptions = {}): StepResult {
  const { auto = false, elapsed = 0 } = options;
  const n = state.tracks.length;
  const seed = state.seed;
  if (n === 0) return { index: null, restart: false, seed };

  const current = state.index >= 0 && state.index < n ? state.index : -1;
  if (direction === 1 && auto && state.loop === 'one' && current >= 0) {
    return { index: current, restart: true, seed };
  }
  if (direction === -1 && current >= 0 && elapsed > RESTART_WINDOW) {
    return { index: current, restart: true, seed };
  }

  const order = playbackOrder(state);
  const position = current < 0 ? (direction === 1 ? -1 : n) : order.indexOf(current);
  const target = position + direction;
  if (target >= 0 && target < n) {
    return { index: order[target] ?? 0, restart: false, seed };
  }
  if (state.loop === 'off') return { index: null, restart: false, seed };

  if (target >= n) {
    if (state.shuffle) {
      const reshuffled = nextSeed(seed);
      const index = shuffleOrder(n, reshuffled)[0] ?? 0;
      return { index, restart: index === current, seed: reshuffled };
    }
    const index = order[0] ?? 0;
    return { index, restart: index === current, seed };
  }
  const index = order[n - 1] ?? 0;
  return { index, restart: index === current, seed };
}

export type QueueAction =
  | { type: 'add'; tracks: Track[] }
  | { type: 'remove'; index: number }
  | { type: 'reorder'; from: number; to: number }
  | { type: 'select'; index: number; seed?: number }
  | { type: 'clear' }
  | { type: 'loop'; mode: LoopMode }
  | { type: 'shuffle'; on: boolean };

export function queueReducer(state: QueueState, action: QueueAction): QueueState {
  switch (action.type) {
    case 'add': {
      const known = new Set(state.tracks.map((t) => t.path));
      const added: Track[] = [];
      for (const track of action.tracks) {
        if (known.has(track.path)) continue;
        known.add(track.path);
        added.push(track);
      }
      if (added.length === 0) return state;
      const tracks = [...state.tracks, ...added];
      const index = state.index < 0 ? state.tracks.length : state.index;
      return { ...state, tracks, index };
    }
    case 'remove': {
      if (action.index < 0 || action.index >= state.tracks.length) return state;
      const tracks = state.tracks.filter((_, i) => i !== action.index);
      let index = state.index;
      if (action.index < state.index) index -= 1;
      index = tracks.length === 0 ? -1 : Math.min(index, tracks.length - 1);
      return { ...state, tracks, index };
    }
    case 'reorder': {
      const n = state.tracks.length;
      if (action.from < 0 || action.from >= n) return state;
      const to = clamp(action.to, 0, n - 1);
      if (to === action.from) return state;
      const tracks = moveItem(state.tracks, action.from, to);
      let index = state.index;
      if (index === action.from) index = to;
      else if (action.from < index && to >= index) index -= 1;
      else if (action.from > index && to <= index) index += 1;
      return { ...state, tracks, index };
    }
    case 'select': {
      const index =
        action.index >= 0 && action.index < state.tracks.length ? action.index : state.index;
      return { ...state, index, seed: action.seed ?? state.seed };
    }
    case 'clear':
      return { ...state, tracks: [], index: -1 };
    case 'loop':
      return { ...state, loop: action.mode };
    case 'shuffle':
      return { ...state, shuffle: action.on, seed: action.on ? nextSeed(state.seed) : state.seed };
  }
}

/** Move one item, keeping the rest in order. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list];
  const [item] = out.splice(from, 1);
  if (item === undefined) return [...list];
  out.splice(to, 0, item);
  return out;
}

/** Row a drag has reached, from the distance it has travelled. */
export function dropTarget(from: number, deltaY: number, rowHeight: number, count: number): number {
  if (!Number.isFinite(deltaY) || rowHeight <= 0 || count <= 0) return from;
  return clamp(from + Math.round(deltaY / rowHeight), 0, count - 1);
}

/** The next loop mode when the Loop button is pressed. */
export function cycleLoop(mode: LoopMode): LoopMode {
  return mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
}
