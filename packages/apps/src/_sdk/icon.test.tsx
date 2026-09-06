import type { AppDefinition } from '@lumen/kernel';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { builtinApps } from '../registry';
import { ICON_TONES, type IconTone } from './icon';

/**
 * `createAppIcon` draws the glyph at `round(size * 0.56)` and thickens the
 * stroke below size 24, so in a list row or on the taskbar (size 16) the box
 * is 9 px and the 2.25 stroke lands at `2.25 * 9 / 24` = 0.84 CSS px. Roughly
 * a pixel and a half of interior survives that: enough to see that a glyph has
 * something inside it, not enough to read what. Two apps drawn from the same
 * silhouette are one icon at that size, and only the tile colour tells them
 * apart.
 *
 * Hence the two rules below: no two apps may draw the same glyph, and no two
 * apps whose glyphs share a silhouette may also share a tone.
 */

/**
 * Silhouettes lucide's icon data cannot see. Glyphs fall into one family
 * automatically when they share a drawn shape — `file-text` and `file-archive`
 * both carry the byte-identical fold `M14 2v5a1 1 0 0 0 1 1h5` — but the same
 * picture is often built from entirely different paths: `image` and `images`
 * have no shape in common and yet both draw a rounded frame around a dot and a
 * diagonal ridge. These groups are that judgement, made by eye at 9 px and
 * written down so it can be argued with. Every name here was read against its
 * node data in lucide-react 1.40; names no app uses yet are guards.
 */
const SILHOUETTES: readonly (readonly string[])[] = [
  // A rounded frame around a dot and a diagonal ridge.
  ['image', 'images'],
  // A rounded square cut by interior rules. `table-2` draws its frame and both
  // rules as a single compound path, so it shares no shape with the grids.
  ['grid-2x2', 'grid-3x2', 'grid-3x3', 'sheet', 'table-2'],
  // A portrait page with a folded top-right corner.
  ['file-archive', 'file-code', 'file-json', 'file-spreadsheet', 'file-text'],
  // A rounded portrait frame, one rule near the top, a field of dots below.
  // Plain `calendar` is deliberately not here: below its rule there is nothing
  // at all, so it reads as an empty frame where these read as a full one.
  ['calculator', 'calendar-days'],
  // One long implement lying corner to corner.
  [
    'brush',
    'hammer',
    'highlighter',
    'paintbrush',
    'pen',
    'pen-line',
    'pencil',
    'pipette',
    'ruler',
    'wrench',
  ],
  // Stacked text lines with a marker column down one side. `clipboard-list` is
  // not one of these: it has an outer frame, which is the kind of difference
  // that does survive at 9 px.
  ['align-left', 'list', 'list-checks', 'logs'],
];

/** What one app's tile actually draws, and the colour it draws it on. */
interface Tile {
  id: string;
  app: string;
  /** lucide's own name for the glyph, read off the class it stamps on the svg. */
  glyph: string;
  /** One canonical string per drawn element. */
  shapes: string[];
  tone: IconTone;
}

/**
 * Tones are matched through the DOM rather than by string, so whatever
 * normalisation happy-dom applies to a hex is applied to both sides.
 */
const TONE_BY_BACKGROUND = ((): Map<string, IconTone> => {
  const probe = document.createElement('span');
  const index = new Map<string, IconTone>();
  for (const tone of Object.keys(ICON_TONES) as IconTone[]) {
    probe.style.background = ICON_TONES[tone];
    index.set(probe.style.background, tone);
  }
  return index;
})();

/** A drawn element as tag plus sorted attributes, so two icons compare by geometry. */
function shapeOf(element: Element): string {
  const rx = element.getAttribute('rx');
  const attributes = Array.from(element.attributes)
    // `class` is lucide's name for the icon, not part of the drawing; and some
    // frames carry `ry` alongside an equal `rx` while others carry only `rx`,
    // which is the same corner drawn two ways.
    .filter((attr) => attr.name !== 'class' && !(attr.name === 'ry' && attr.value === rx))
    .map((attr) => `${attr.name}=${attr.value}`)
    .sort();
  return `${element.tagName.toLowerCase()}(${attributes.join(' ')})`;
}

/** Render one app's icon and read back the glyph, its shapes and its tone. */
function readTile(app: AppDefinition): Tile {
  const { container, unmount } = render(<app.icon size={16} />);
  const tile = container.firstElementChild;
  const svg = container.querySelector('svg');
  if (!(tile instanceof HTMLElement) || !svg) {
    throw new Error(`${app.id} did not render a tile with a glyph in it`);
  }
  // createLucideIcon stamps `lucide-<pascal-cased name>` then `lucide-<name>`;
  // the last one is lucide's canonical name and survives its own aliases.
  const glyph = Array.from(svg.classList)
    .filter((token) => token.startsWith('lucide-'))
    .map((token) => token.slice('lucide-'.length))
    .at(-1);
  const tone = TONE_BY_BACKGROUND.get(tile.style.background);
  if (!glyph || !tone) {
    throw new Error(
      `${app.id}: read glyph ${glyph ?? '(none)'} and background ${tile.style.background}`,
    );
  }
  const shapes = Array.from(svg.children).map(shapeOf);
  unmount();
  return { id: app.id, app: app.name, glyph, shapes, tone };
}

let rendered: Tile[] | undefined;

/** Every built-in tile, drawn once — a glyph is only visible once rendered. */
function tiles(): Tile[] {
  rendered ??= builtinApps.map(readTile);
  return rendered;
}

/** Union-find over app ids, so a chain of similar glyphs collapses to one family. */
function familiesOf(all: readonly Tile[]): Tile[][] {
  const parent = new Map(all.map((tile) => [tile.id, tile.id]));
  const find = (id: string): string => {
    let root = id;
    for (
      let next = parent.get(root);
      next !== undefined && next !== root;
      next = parent.get(root)
    ) {
      root = next;
    }
    return root;
  };
  const join = (a: string, b: string) => parent.set(find(a), find(b));

  const firstWithShape = new Map<string, string>();
  const firstInSilhouette = new Map<string, string>();
  for (const tile of all) {
    for (const shape of tile.shapes) {
      const first = firstWithShape.get(shape);
      if (first) join(first, tile.id);
      else firstWithShape.set(shape, tile.id);
    }
    const group = SILHOUETTES.find((names) => names.includes(tile.glyph));
    const key = group?.[0];
    if (key === undefined) continue;
    const first = firstInSilhouette.get(key);
    if (first) join(first, tile.id);
    else firstInSilhouette.set(key, tile.id);
  }

  const byRoot = new Map<string, Tile[]>();
  for (const tile of all) {
    const root = find(tile.id);
    const family = byRoot.get(root);
    if (family) family.push(tile);
    else byRoot.set(root, [tile]);
  }
  return [...byRoot.values()];
}

describe('app icons', () => {
  it('gives every app a glyph no other app draws', () => {
    const firstToDrawIt = new Map<string, Tile>();
    const repeats: string[] = [];
    for (const tile of tiles()) {
      const drawing = tile.shapes.join(' ');
      const first = firstToDrawIt.get(drawing);
      if (first) repeats.push(`${first.app} and ${tile.app} both draw ${first.glyph}`);
      else firstToDrawIt.set(drawing, tile);
    }
    expect(repeats).toEqual([]);
  });

  it('never lands two apps on one silhouette and one tone', () => {
    const clashes: string[] = [];
    for (const family of familiesOf(tiles())) {
      const byTone = new Map<IconTone, Tile[]>();
      for (const tile of family) {
        const sharing = byTone.get(tile.tone);
        if (sharing) sharing.push(tile);
        else byTone.set(tile.tone, [tile]);
      }
      for (const [tone, sharing] of byTone) {
        if (sharing.length < 2) continue;
        const who = sharing.map((tile) => `${tile.app} (${tile.glyph})`).join(', ');
        clashes.push(`${who} are one silhouette on ${tone}`);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('uses every tone it declares', () => {
    const used = new Set(tiles().map((tile) => tile.tone));
    const idle = (Object.keys(ICON_TONES) as IconTone[]).filter((tone) => !used.has(tone));
    expect(idle).toEqual([]);
  });
});
