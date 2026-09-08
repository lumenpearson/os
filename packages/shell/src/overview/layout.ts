/**
 * Where every open window goes in the overview.
 *
 * The requirement is that the overview shows the windows *grouped by the
 * application they belong to*, rather than as one undifferentiated grid: with
 * a dozen windows open, "which of these is a Files window" is the question
 * the screen exists to answer, and a grid in z-order answers it only by
 * making you read every title.
 *
 * So each app gets a band with its name above it, bands are ordered by that
 * name so the screen does not rearrange itself as you focus things, and the
 * windows inside a band sit in one row, each scaled to fit. Everything has to
 * fit at once: the previews are the real window elements moved into place, so
 * there is nothing here that could scroll.
 */

export interface OverviewWindow {
  id: string;
  title: string;
  appId: string;
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OverviewItem {
  id: string;
  title: string;
  appId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
}

export interface OverviewGroup {
  appId: string;
  name: string;
  /** The heading's own line, above the row of windows. */
  labelX: number;
  labelY: number;
  /** False when the bands are too thin for a heading to be read. */
  showLabel: boolean;
  items: OverviewItem[];
}

/** Space around and between the bands, when there is room for it. */
const PAD = 24;
/** The height reserved for a band's heading, when there is room for it. */
const HEADING = 22;
/** Below this the heading has no room to be read, so it is not drawn. */
const MIN_HEADING = 13;
/** A window is never blown up past this, however much room a band has. */
const MAX_SCALE = 0.9;
/** Nor shrunk below it, however many windows there are. */
const MIN_SCALE = 0.04;

/**
 * Group the windows by app and place them. `name` turns an app id into the
 * name to show and to order by; an app the registry does not know keeps its
 * id, which is at least true.
 *
 * Everything is derived from each band's share of the height rather than from
 * fixed padding, so twelve apps open on a short screen produce twelve thin
 * bands instead of a column that runs off the bottom. Nothing here can
 * scroll — the previews are the real windows moved into place — so a layout
 * that does not fit is a layout with windows nobody can click.
 */
export function overviewLayout(
  windows: readonly OverviewWindow[],
  area: Rect,
  name: (appId: string) => string,
): OverviewGroup[] {
  if (windows.length === 0) return [];

  const byApp = new Map<string, OverviewWindow[]>();
  for (const w of windows) {
    const list = byApp.get(w.appId);
    if (list) list.push(w);
    else byApp.set(w.appId, [w]);
  }

  const apps = [...byApp.keys()].sort((a, b) => {
    const byName = name(a).localeCompare(name(b), undefined, { sensitivity: 'base' });
    return byName !== 0 ? byName : a.localeCompare(b);
  });

  const bands = apps.length;
  const stride = Math.max(1, area.height / bands);
  const heading = Math.min(HEADING, stride * 0.25);
  const gap = Math.min(PAD, stride * 0.15);
  const bandHeight = Math.max(1, stride - heading - gap);

  return apps.map((appId, band) => {
    const list = byApp.get(appId) as OverviewWindow[];
    const top = area.y + band * stride;
    const cols = list.length;
    const hgap = Math.min(PAD, area.width / (cols + 1) / 2);
    const cellWidth = Math.max(1, (area.width - hgap * (cols + 1)) / cols);
    const items = list.map((w, i) => {
      const scale = clamp(
        Math.min(cellWidth / Math.max(1, w.width), bandHeight / Math.max(1, w.height)),
        MIN_SCALE,
        MAX_SCALE,
      );
      const width = w.width * scale;
      const height = w.height * scale;
      const cellX = area.x + hgap + i * (cellWidth + hgap);
      return {
        id: w.id,
        title: w.title,
        appId: w.appId,
        // Centred in its cell, and sitting on the band's floor so a row of
        // windows of different heights reads as a shelf rather than a scatter.
        x: cellX + (cellWidth - width) / 2,
        y: top + heading + (bandHeight - height),
        width,
        height,
        scale,
      };
    });
    return {
      appId,
      name: name(appId),
      labelX: area.x + hgap,
      labelY: top,
      showLabel: heading >= MIN_HEADING,
      items,
    };
  });
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}
