/**
 * What the app keeps in ~/.config/colour.json: the colour it was left on, the
 * colour that was being compared against, which panel was open, and the
 * palette the person built.
 *
 * The file is text under the user's home, so a person or another program can
 * edit it. Nothing read back is trusted: an entry whose hex no longer parses is
 * dropped, a duplicate id is dropped, and a file that is not an object at all
 * yields the defaults. A palette that cannot be read is an empty palette.
 */

import { formatHex, parseHex, type Rgba } from '../paint/colour';

export type PanelId = 'contrast' | 'palette' | 'vision';

const PANEL_IDS: readonly PanelId[] = ['contrast', 'palette', 'vision'];

export interface Swatch {
  /** Stable across renames and reorders, so React keys and menus can hold it. */
  id: string;
  /** `#rrggbb` or `#rrggbbaa`, lower case. */
  hex: string;
  /** May be empty; the row then shows the hex. */
  name: string;
}

export interface ColourData {
  colour: string;
  compare: string;
  panel: PanelId;
  swatches: Swatch[];
}

/** As many swatches as stay useful to scan; beyond this the oldest are kept. */
export const SWATCH_LIMIT = 64;

/** How long a swatch name may be. Long enough for "Header background". */
export const NAME_LIMIT = 40;

export const DEFAULT_DATA: ColourData = {
  colour: '#2f6fd6',
  compare: '#ffffff',
  panel: 'contrast',
  swatches: [],
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function isPanelId(value: unknown): value is PanelId {
  return typeof value === 'string' && PANEL_IDS.includes(value as PanelId);
}

/** A hex string this app is willing to store, or null. */
export function readHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const colour = parseHex(value);
  return colour === null ? null : formatHex(colour);
}

function readSwatch(value: unknown, taken: Set<string>): Swatch | null {
  if (!isRecord(value)) return null;
  const hex = readHex(value.hex);
  if (hex === null) return null;
  const id = typeof value.id === 'string' && value.id !== '' ? value.id : null;
  if (id === null || taken.has(id)) return null;
  const name = typeof value.name === 'string' ? value.name.slice(0, NAME_LIMIT) : '';
  return { id, hex, name };
}

export function normalizeData(raw: unknown): ColourData {
  if (!isRecord(raw)) return { ...DEFAULT_DATA, swatches: [] };
  const swatches: Swatch[] = [];
  const taken = new Set<string>();
  if (Array.isArray(raw.swatches)) {
    for (const entry of raw.swatches) {
      const swatch = readSwatch(entry, taken);
      if (!swatch) continue;
      taken.add(swatch.id);
      swatches.push(swatch);
      if (swatches.length === SWATCH_LIMIT) break;
    }
  }
  return {
    colour: readHex(raw.colour) ?? DEFAULT_DATA.colour,
    compare: readHex(raw.compare) ?? DEFAULT_DATA.compare,
    panel: isPanelId(raw.panel) ? raw.panel : DEFAULT_DATA.panel,
    swatches,
  };
}

/**
 * The next free id. Numbered rather than random so the same palette written
 * twice reads the same, and so a test can say which swatch it means.
 */
export function nextSwatchId(swatches: readonly Swatch[]): string {
  let highest = 0;
  for (const swatch of swatches) {
    const digits = /^swatch-(\d+)$/.exec(swatch.id)?.[1];
    if (digits !== undefined) highest = Math.max(highest, Number(digits));
  }
  return `swatch-${highest + 1}`;
}

/** Append the colour. Full palettes drop their oldest entry to make room. */
export function addSwatch(data: ColourData, colour: Rgba, name = ''): ColourData {
  const swatch: Swatch = {
    id: nextSwatchId(data.swatches),
    hex: formatHex(colour),
    name: name.slice(0, NAME_LIMIT),
  };
  const kept = data.swatches.slice(Math.max(0, data.swatches.length - (SWATCH_LIMIT - 1)));
  return { ...data, swatches: [...kept, swatch] };
}

export function removeSwatch(data: ColourData, id: string): ColourData {
  const swatches = data.swatches.filter((swatch) => swatch.id !== id);
  return swatches.length === data.swatches.length ? data : { ...data, swatches };
}

export function renameSwatch(data: ColourData, id: string, name: string): ColourData {
  const trimmed = name.trim().slice(0, NAME_LIMIT);
  return {
    ...data,
    swatches: data.swatches.map((swatch) =>
      swatch.id === id ? { ...swatch, name: trimmed } : swatch,
    ),
  };
}

/**
 * Move one swatch by `delta` places. Off either end is a no-op rather than a
 * wrap: the buttons that call this are disabled there, and a keyboard repeat
 * that ran past the end should stop, not jump to the other end.
 */
export function moveSwatch(data: ColourData, id: string, delta: number): ColourData {
  const from = data.swatches.findIndex((swatch) => swatch.id === id);
  if (from < 0) return data;
  const to = from + delta;
  if (to < 0 || to >= data.swatches.length) return data;
  const swatches = [...data.swatches];
  const [moved] = swatches.splice(from, 1);
  if (!moved) return data;
  swatches.splice(to, 0, moved);
  return { ...data, swatches };
}

export function clearSwatches(data: ColourData): ColourData {
  return data.swatches.length === 0 ? data : { ...data, swatches: [] };
}

/** What the row is called: the name if it has one, else its hex. */
export function swatchLabel(swatch: Swatch): string {
  return swatch.name.trim() === '' ? swatch.hex : swatch.name;
}
