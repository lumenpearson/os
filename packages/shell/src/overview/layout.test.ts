import { describe, expect, it } from 'vitest';
import { type OverviewWindow, overviewLayout, type Rect } from './layout';

const area: Rect = { x: 0, y: 26, width: 1280, height: 700 };

const NAMES: Record<string, string> = {
  'lumen.files': 'Files',
  'lumen.terminal': 'Terminal',
  'lumen.browser': 'Browser',
};
const name = (id: string) => NAMES[id] ?? id;

function win(over: Partial<OverviewWindow> & { id: string; appId: string }): OverviewWindow {
  return { title: over.id, width: 800, height: 500, ...over };
}

describe('overviewLayout', () => {
  it('has nothing to place for no windows', () => {
    expect(overviewLayout([], area, name)).toEqual([]);
  });

  it('gives each app a band of its own', () => {
    const groups = overviewLayout(
      [
        win({ id: 'a', appId: 'lumen.files' }),
        win({ id: 'b', appId: 'lumen.terminal' }),
        win({ id: 'c', appId: 'lumen.files' }),
      ],
      area,
      name,
    );
    expect(groups.map((g) => g.appId)).toEqual(['lumen.files', 'lumen.terminal']);
    expect(groups[0]?.items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(groups[1]?.items.map((i) => i.id)).toEqual(['b']);
  });

  it('orders bands by the app name, not by the id or the z-order', () => {
    const groups = overviewLayout(
      [
        win({ id: 'a', appId: 'lumen.terminal' }),
        win({ id: 'b', appId: 'lumen.files' }),
        win({ id: 'c', appId: 'lumen.browser' }),
      ],
      area,
      name,
    );
    expect(groups.map((g) => g.name)).toEqual(['Browser', 'Files', 'Terminal']);
  });

  it('is stable when the same windows arrive in another order', () => {
    const windows = [
      win({ id: 'a', appId: 'lumen.terminal' }),
      win({ id: 'b', appId: 'lumen.files' }),
    ];
    const first = overviewLayout(windows, area, name);
    const second = overviewLayout([...windows].reverse(), area, name);
    expect(second.map((g) => g.appId)).toEqual(first.map((g) => g.appId));
    expect(second[0]?.labelY).toBe(first[0]?.labelY);
  });

  it('falls back to the id for an app the registry does not know', () => {
    const groups = overviewLayout([win({ id: 'a', appId: 'user.clock' })], area, name);
    expect(groups[0]?.name).toBe('user.clock');
  });

  it('keeps every window inside the work area', () => {
    const groups = overviewLayout(
      [
        win({ id: 'a', appId: 'lumen.files' }),
        win({ id: 'b', appId: 'lumen.files' }),
        win({ id: 'c', appId: 'lumen.terminal', width: 1200, height: 900 }),
        win({ id: 'd', appId: 'lumen.browser' }),
      ],
      area,
      name,
    );
    for (const group of groups) {
      expect(group.labelY).toBeGreaterThanOrEqual(area.y);
      for (const item of group.items) {
        expect(item.x).toBeGreaterThanOrEqual(area.x);
        expect(item.y).toBeGreaterThanOrEqual(area.y);
        expect(item.x + item.width).toBeLessThanOrEqual(area.x + area.width + 0.001);
        expect(item.y + item.height).toBeLessThanOrEqual(area.y + area.height + 0.001);
      }
    }
  });

  it('never overlaps two bands', () => {
    const groups = overviewLayout(
      [
        win({ id: 'a', appId: 'lumen.files' }),
        win({ id: 'b', appId: 'lumen.terminal' }),
        win({ id: 'c', appId: 'lumen.browser' }),
      ],
      area,
      name,
    );
    for (let i = 1; i < groups.length; i++) {
      const above = groups[i - 1];
      const below = groups[i];
      if (!above || !below) throw new Error('missing band');
      const lowest = Math.max(...above.items.map((it) => it.y + it.height));
      expect(below.labelY).toBeGreaterThanOrEqual(lowest);
    }
  });

  it('never overlaps two windows in the same band', () => {
    const groups = overviewLayout(
      Array.from({ length: 5 }, (_, i) => win({ id: `w${i}`, appId: 'lumen.files' })),
      area,
      name,
    );
    const items = groups[0]?.items ?? [];
    for (let i = 1; i < items.length; i++) {
      const left = items[i - 1];
      const right = items[i];
      if (!left || !right) throw new Error('missing item');
      expect(right.x).toBeGreaterThanOrEqual(left.x + left.width);
    }
  });

  it('keeps every window its own shape', () => {
    const groups = overviewLayout(
      [win({ id: 'a', appId: 'lumen.files', width: 900, height: 300 })],
      area,
      name,
    );
    const item = groups[0]?.items[0];
    if (!item) throw new Error('nothing placed');
    expect(item.width / item.height).toBeCloseTo(3, 6);
  });

  it('never blows a window up past its real size', () => {
    const groups = overviewLayout(
      [win({ id: 'a', appId: 'lumen.files', width: 200, height: 120 })],
      area,
      name,
    );
    expect(groups[0]?.items[0]?.scale).toBeLessThanOrEqual(0.9);
  });

  it('still places something when there are more windows than room', () => {
    const many = Array.from({ length: 40 }, (_, i) => win({ id: `w${i}`, appId: `app.${i % 12}` }));
    const crowded = { x: 0, y: 0, width: 400, height: 300 };
    const groups = overviewLayout(many, crowded, name);
    expect(groups).toHaveLength(12);
    for (const group of groups) {
      for (const item of group.items) {
        expect(item.width).toBeGreaterThan(0);
        expect(item.height).toBeGreaterThan(0);
        // The whole point: nothing runs off the bottom where it cannot be
        // clicked, because the overview has nothing that could scroll.
        expect(item.x).toBeGreaterThanOrEqual(crowded.x);
        expect(item.y).toBeGreaterThanOrEqual(crowded.y);
        expect(item.x + item.width).toBeLessThanOrEqual(crowded.x + crowded.width + 0.001);
        expect(item.y + item.height).toBeLessThanOrEqual(crowded.y + crowded.height + 0.001);
      }
    }
  });

  it('drops the headings when the bands are too thin to read one', () => {
    const many = Array.from({ length: 20 }, (_, i) => win({ id: `w${i}`, appId: `app.${i}` }));
    const groups = overviewLayout(many, { x: 0, y: 0, width: 900, height: 400 }, name);
    expect(groups.every((g) => g.showLabel)).toBe(false);
  });

  it('keeps the headings when there is room for them', () => {
    const groups = overviewLayout(
      [win({ id: 'a', appId: 'lumen.files' }), win({ id: 'b', appId: 'lumen.terminal' })],
      area,
      name,
    );
    expect(groups.every((g) => g.showLabel)).toBe(true);
  });
});
