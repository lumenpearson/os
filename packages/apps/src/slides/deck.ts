/**
 * The `.lsl` presentation document: its shape, the operations that change it,
 * and the undo history those operations stack up. Everything here is pure, so
 * the app component is only a view over it.
 */

export const DECK_VERSION = 1;
/** Slides are authored at a fixed size and transform-scaled to fit their pane. */
export const SLIDE_WIDTH = 960;
export const SLIDE_HEIGHT = 540;
/** Deck snapshots kept for undo. */
export const HISTORY_LIMIT = 100;
/** The slide never draws narrower than this, however small the pane gets. */
export const MIN_SLIDE_WIDTH = 320;

export type SlideLayout = 'title' | 'bullets' | 'text' | 'two-column' | 'blank' | 'image';
export type DeckTheme = 'light' | 'dark';

export const SLIDE_LAYOUTS: readonly SlideLayout[] = [
  'title',
  'bullets',
  'text',
  'two-column',
  'blank',
  'image',
];

export const LAYOUT_LABELS: Record<SlideLayout, string> = {
  title: 'Title',
  bullets: 'Bullets',
  text: 'Text',
  'two-column': 'Two Column',
  blank: 'Blank',
  image: 'Image',
};

export const THEME_LABELS: Record<DeckTheme, string> = {
  light: 'Light',
  dark: 'Dark',
};

export interface Slide {
  id: string;
  layout: SlideLayout;
  title?: string;
  subtitle?: string;
  bullets?: string[];
  text?: string;
  left?: string;
  right?: string;
  imagePath?: string;
  notes?: string;
}

export interface Deck {
  version: number;
  title: string;
  theme?: DeckTheme;
  slides: Slide[];
}

/** The text fields a slide can carry, in the order they are written to disk. */
const TEXT_FIELDS = ['title', 'subtitle', 'text', 'left', 'right', 'imagePath', 'notes'] as const;

export type SlidePatch = Partial<Omit<Slide, 'id'>>;

// ── reading a file ────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function isSlideLayout(value: unknown): value is SlideLayout {
  return typeof value === 'string' && (SLIDE_LAYOUTS as readonly string[]).includes(value);
}

export function isDeckTheme(value: unknown): value is DeckTheme {
  return value === 'light' || value === 'dark';
}

/**
 * The next free `sN` id. Ids stay stable for the life of a slide, so undo,
 * selection and React keys all survive a reorder.
 */
export function nextSlideId(taken: Iterable<string>): string {
  const used = new Set(taken);
  let highest = 0;
  for (const id of used) {
    const match = /^s(\d+)$/.exec(id);
    if (match?.[1]) highest = Math.max(highest, Number(match[1]));
  }
  let candidate = highest + 1;
  while (used.has(`s${candidate}`)) candidate += 1;
  return `s${candidate}`;
}

function normalizeSlide(value: unknown, taken: Set<string>): Slide {
  const source = isRecord(value) ? value : {};
  const declared = asText(source.id);
  const id = declared && !taken.has(declared) ? declared : nextSlideId(taken);
  taken.add(id);
  const slide: Slide = { id, layout: isSlideLayout(source.layout) ? source.layout : 'blank' };
  for (const field of TEXT_FIELDS) {
    const text = asText(source[field]);
    if (text !== undefined) slide[field] = text;
  }
  if (Array.isArray(source.bullets)) {
    slide.bullets = source.bullets.filter((item): item is string => typeof item === 'string');
  }
  return slide;
}

/** Read a parsed `.lsl` file into a deck, repairing whatever is missing. */
export function normalizeDeck(value: unknown, fallbackTitle = 'Untitled'): Deck {
  const source = isRecord(value) ? value : {};
  const taken = new Set<string>();
  const raw = Array.isArray(source.slides) ? source.slides : [];
  return {
    version: DECK_VERSION,
    title: asText(source.title) ?? fallbackTitle,
    theme: isDeckTheme(source.theme) ? source.theme : undefined,
    slides: raw.map((slide) => normalizeSlide(slide, taken)),
  };
}

// ── writing a file ────────────────────────────────────────────────────────

/** Drop the empty bullets a trailing Enter leaves behind. */
export function trimTrailingBullets(bullets: readonly string[]): string[] {
  let end = bullets.length;
  while (end > 0 && (bullets[end - 1] ?? '').trim() === '') end -= 1;
  return bullets.slice(0, end);
}

function slideToJson(slide: Slide): Record<string, unknown> {
  const out: Record<string, unknown> = { id: slide.id, layout: slide.layout };
  for (const field of TEXT_FIELDS) {
    const text = slide[field];
    if (text) out[field] = text;
  }
  const bullets = trimTrailingBullets(slide.bullets ?? []);
  if (bullets.length > 0) out.bullets = bullets;
  return out;
}

/** The document as it is written to disk: fixed key order, empty fields dropped. */
export function toJson(deck: Deck): Record<string, unknown> {
  const out: Record<string, unknown> = { version: DECK_VERSION, title: deck.title };
  if (deck.theme) out.theme = deck.theme;
  out.slides = deck.slides.map(slideToJson);
  return out;
}

/**
 * Canonical text of a deck. Saving writes it and dirty tracking compares it,
 * so a change that survives a round trip is exactly a change that counts.
 */
export function serializeDeck(deck: Deck): string {
  return `${JSON.stringify(toJson(deck), null, 2)}\n`;
}

// ── creating ──────────────────────────────────────────────────────────────

export function createSlide(layout: SlideLayout, id: string): Slide {
  switch (layout) {
    case 'title':
      return { id, layout, title: '', subtitle: '' };
    case 'bullets':
      return { id, layout, title: '', bullets: [] };
    case 'text':
      return { id, layout, title: '', text: '' };
    case 'two-column':
      return { id, layout, title: '', left: '', right: '' };
    case 'image':
      return { id, layout, title: '' };
    case 'blank':
      return { id, layout };
  }
}

export function createDeck(title = 'Untitled'): Deck {
  return { version: DECK_VERSION, title, slides: [createSlide('title', 's1')] };
}

// ── changing ──────────────────────────────────────────────────────────────

export type DeckAction =
  | { type: 'add'; index: number; layout: SlideLayout }
  | { type: 'duplicate'; index: number }
  | { type: 'delete'; index: number }
  | { type: 'move'; from: number; to: number }
  | { type: 'update'; index: number; patch: SlidePatch }
  | { type: 'setTitle'; title: string }
  | { type: 'setTheme'; theme: DeckTheme };

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

export function reduceDeck(deck: Deck, action: DeckAction): Deck {
  switch (action.type) {
    case 'add': {
      const at = clamp(action.index + 1, 0, deck.slides.length);
      const slide = createSlide(action.layout, nextSlideId(deck.slides.map((s) => s.id)));
      const slides = deck.slides.slice();
      slides.splice(at, 0, slide);
      return { ...deck, slides };
    }
    case 'duplicate': {
      const source = deck.slides[action.index];
      if (!source) return deck;
      const copy: Slide = {
        ...source,
        id: nextSlideId(deck.slides.map((s) => s.id)),
        ...(source.bullets ? { bullets: source.bullets.slice() } : {}),
      };
      const slides = deck.slides.slice();
      slides.splice(action.index + 1, 0, copy);
      return { ...deck, slides };
    }
    case 'delete': {
      if (!deck.slides[action.index]) return deck;
      const slides = deck.slides.slice();
      slides.splice(action.index, 1);
      return { ...deck, slides };
    }
    case 'move': {
      const from = action.from;
      if (!deck.slides[from]) return deck;
      const to = clamp(action.to, 0, deck.slides.length - 1);
      if (from === to) return deck;
      const slides = deck.slides.slice();
      const [moved] = slides.splice(from, 1);
      if (!moved) return deck;
      slides.splice(to, 0, moved);
      return { ...deck, slides };
    }
    case 'update': {
      const slide = deck.slides[action.index];
      if (!slide) return deck;
      const slides = deck.slides.slice();
      slides[action.index] = { ...slide, ...action.patch, id: slide.id };
      return { ...deck, slides };
    }
    case 'setTitle':
      return { ...deck, title: action.title };
    case 'setTheme':
      return { ...deck, theme: action.theme };
  }
}

/** Where the selection lands after an action, so the edited slide stays in view. */
export function nextSelection(action: DeckAction, deck: Deck, current: number): number {
  switch (action.type) {
    case 'add':
      return clamp(action.index + 1, 0, deck.slides.length);
    case 'duplicate':
      return deck.slides[action.index] ? action.index + 1 : current;
    case 'delete':
      return deck.slides[action.index] ? clamp(current, 0, deck.slides.length - 2) : current;
    case 'move':
      return deck.slides[action.from] ? clamp(action.to, 0, deck.slides.length - 1) : current;
    default:
      return current;
  }
}

// ── history ───────────────────────────────────────────────────────────────

export interface DeckHistory {
  past: Deck[];
  present: Deck;
  future: Deck[];
}

export function createHistory(deck: Deck): DeckHistory {
  return { past: [], present: deck, future: [] };
}

/** Record a new present, dropping the oldest snapshot once the cap is reached. */
export function pushHistory(history: DeckHistory, next: Deck): DeckHistory {
  if (next === history.present) return history;
  const past = [...history.past, history.present];
  return { past: past.slice(Math.max(0, past.length - HISTORY_LIMIT)), present: next, future: [] };
}

export function applyAction(history: DeckHistory, action: DeckAction): DeckHistory {
  return pushHistory(history, reduceDeck(history.present, action));
}

export function canUndo(history: DeckHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: DeckHistory): boolean {
  return history.future.length > 0;
}

export function undo(history: DeckHistory): DeckHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redo(history: DeckHistory): DeckHistory {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return { past: [...history.past, history.present], present: next, future: rest };
}

// ── geometry ──────────────────────────────────────────────────────────────

export interface Size {
  width: number;
  height: number;
}

export interface FitOptions {
  /** Breathing room around the slide, in pane pixels. */
  padding?: number;
  /** Smallest drawn width; 0 lets the slide shrink to nothing (letterboxing). */
  minWidth?: number;
  maxScale?: number;
}

/** The scale that fits a 16:9 slide inside `pane`. */
export function fitScale(pane: Size, options: FitOptions = {}): number {
  const { padding = 0, minWidth = MIN_SLIDE_WIDTH, maxScale = 2 } = options;
  const width = pane.width - padding * 2;
  const height = pane.height - padding * 2;
  const floor = minWidth / SLIDE_WIDTH;
  if (!(width > 0) || !(height > 0)) return floor;
  const scale = Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT);
  return clamp(scale, floor, maxScale);
}
