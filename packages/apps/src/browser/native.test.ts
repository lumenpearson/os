import { describe, expect, it } from 'vitest';
import { createStack } from './history';
import {
  afterCommands,
  isClear,
  overlaps,
  type ViewSent,
  viewCommands,
  viewsWanted,
} from './native';
import type { Tab } from './tabs';

function tab(over: Partial<Tab> = {}): Tab {
  const url = over.url ?? 'https://example.com/';
  return {
    id: 'tab-1',
    url,
    title: 'Example',
    stack: createStack(url),
    status: 'loading',
    zoom: 1,
    generation: 0,
    ...over,
  };
}

describe('viewsWanted', () => {
  it('gives a view to every web page', () => {
    const wanted = viewsWanted([
      tab({ id: 'tab-1', url: 'https://a.example/' }),
      tab({ id: 'tab-2', url: 'http://b.example/' }),
    ]);
    expect(wanted.map((w) => w.id)).toEqual(['tab-1', 'tab-2']);
  });

  it('leaves Lumen’s own pages to Lumen', () => {
    const wanted = viewsWanted([tab({ url: 'lumen://start' }), tab({ url: 'lumen://settings' })]);
    expect(wanted).toEqual([]);
  });

  it('opens nothing for a site the user sends outside', () => {
    expect(viewsWanted([tab({ status: 'external' })])).toEqual([]);
  });
});

describe('viewCommands', () => {
  const sent = (over: Partial<ViewSent> = {}): ViewSent => ({
    url: 'https://example.com/',
    generation: 0,
    zoom: 1,
    ...over,
  });

  it('opens a view the host does not have, and zooms it', () => {
    const wanted = viewsWanted([tab({ zoom: 1.25 })]);
    expect(viewCommands(wanted, new Map())).toEqual([
      { kind: 'open', id: 'tab-1', url: 'https://example.com/' },
      { kind: 'zoom', id: 'tab-1', factor: 1.25 },
    ]);
  });

  it('says nothing about a view that is where it should be', () => {
    const wanted = viewsWanted([tab()]);
    expect(viewCommands(wanted, new Map([['tab-1', sent()]]))).toEqual([]);
  });

  it('navigates when the address changed', () => {
    const wanted = viewsWanted([tab({ url: 'https://other.example/' })]);
    expect(viewCommands(wanted, new Map([['tab-1', sent()]]))).toEqual([
      { kind: 'navigate', id: 'tab-1', url: 'https://other.example/' },
    ]);
  });

  it('reloads when the same address is asked for again', () => {
    const wanted = viewsWanted([tab({ generation: 1 })]);
    expect(viewCommands(wanted, new Map([['tab-1', sent()]]))).toEqual([
      { kind: 'reload', id: 'tab-1' },
    ]);
  });

  it('does not reload a view it is already navigating', () => {
    const wanted = viewsWanted([tab({ url: 'https://other.example/', generation: 1 })]);
    expect(viewCommands(wanted, new Map([['tab-1', sent()]]))).toEqual([
      { kind: 'navigate', id: 'tab-1', url: 'https://other.example/' },
    ]);
  });

  it('closes the view of a tab that has gone', () => {
    expect(viewCommands([], new Map([['tab-1', sent()]]))).toEqual([
      { kind: 'close', id: 'tab-1' },
    ]);
  });

  it('closes a view when its tab goes to an internal page', () => {
    const wanted = viewsWanted([tab({ url: 'lumen://history' })]);
    expect(viewCommands(wanted, new Map([['tab-1', sent()]]))).toEqual([
      { kind: 'close', id: 'tab-1' },
    ]);
  });
});

describe('afterCommands', () => {
  it('records what the host was told, and forgets a view that closed', () => {
    const next = afterCommands(viewsWanted([tab({ id: 'tab-2', zoom: 2, generation: 3 })]));
    expect(next.get('tab-1')).toBeUndefined();
    expect(next.get('tab-2')).toEqual({
      url: 'https://example.com/',
      generation: 3,
      zoom: 2,
    });
  });
});

describe('overlaps', () => {
  const page = { x: 100, y: 100, width: 200, height: 200 };

  it('is true for a box over the page', () => {
    expect(overlaps(page, { x: 150, y: 150, width: 10, height: 10 })).toBe(true);
    expect(overlaps(page, { x: 0, y: 0, width: 120, height: 120 })).toBe(true);
  });

  it('is false for a box beside it, edges included', () => {
    expect(overlaps(page, { x: 300, y: 100, width: 50, height: 50 })).toBe(false);
    expect(overlaps(page, { x: 0, y: 0, width: 100, height: 100 })).toBe(false);
    expect(overlaps(page, { x: 100, y: 320, width: 50, height: 50 })).toBe(false);
  });
});

describe('isClear', () => {
  const page = { x: 0, y: 40, width: 800, height: 600 };

  it('is clear with nothing over it', () => {
    expect(isClear(page, [])).toBe(true);
  });

  it('is not clear under a window in front', () => {
    expect(isClear(page, [{ x: 100, y: 100, width: 300, height: 200 }])).toBe(false);
  });

  it('is not clear before the page area is laid out', () => {
    expect(isClear({ x: 0, y: 0, width: 0, height: 0 }, [])).toBe(false);
  });
});
