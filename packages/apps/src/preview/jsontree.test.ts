import { describe, expect, it } from 'vitest';
import {
  buildJsonTree,
  containerIds,
  defaultExpanded,
  formatLeaf,
  jsonKind,
  navigate,
  ROOT_ID,
  type TreeState,
  visibleRows,
} from './jsontree';

const document_ = {
  name: 'Lumen',
  version: 2,
  stable: false,
  notes: null,
  tags: ['os', 'desktop'],
  window: { width: 900, height: 660 },
};

const tree = buildJsonTree(document_);
const labels = (state: TreeState) =>
  visibleRows(tree, state.expanded).map((r) => `${'  '.repeat(r.depth)}${r.node.label}`);

describe('jsonKind', () => {
  it('separates null and arrays from objects', () => {
    expect(jsonKind(null)).toBe('null');
    expect(jsonKind([])).toBe('array');
    expect(jsonKind({})).toBe('object');
    expect(jsonKind('a')).toBe('string');
    expect(jsonKind(1)).toBe('number');
    expect(jsonKind(true)).toBe('boolean');
  });

  it('treats anything JSON cannot hold as null', () => {
    expect(jsonKind(undefined)).toBe('null');
  });
});

describe('formatLeaf', () => {
  it('keeps quotes and escapes on strings', () => {
    expect(formatLeaf('hi')).toBe('"hi"');
    expect(formatLeaf('say "no"')).toBe('"say \\"no\\""');
  });

  it('prints the other scalars plainly', () => {
    expect(formatLeaf(42)).toBe('42');
    expect(formatLeaf(-0.5)).toBe('-0.5');
    expect(formatLeaf(true)).toBe('true');
    expect(formatLeaf(null)).toBe('null');
    expect(formatLeaf(Number.POSITIVE_INFINITY)).toBe('null');
  });
});

describe('buildJsonTree', () => {
  it('summarises containers by their size', () => {
    expect(tree.summary).toBe('6 keys');
    expect(tree.children.find((c) => c.label === 'tags')?.summary).toBe('2 items');
    expect(buildJsonTree({}).summary).toBe('empty');
    expect(buildJsonTree([1]).summary).toBe('1 item');
    expect(buildJsonTree({ a: 1 }).summary).toBe('1 key');
  });

  it('labels array members by index and keeps leaf values', () => {
    const tags = tree.children.find((c) => c.label === 'tags');
    expect(tags?.children.map((c) => c.label)).toEqual(['0', '1']);
    expect(tags?.children[0]?.summary).toBe('"os"');
  });

  it('gives every node a unique id even when keys repeat a separator', () => {
    const awkward = buildJsonTree({ 'a.b': { c: 1 }, a: { 'b.c': 2 } });
    const ids = visibleRows(awkward, containerIds(awkward)).map((r) => r.node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('names the root', () => {
    expect(buildJsonTree(1, 'config.json').label).toBe('config.json');
    expect(tree.id).toBe(ROOT_ID);
  });
});

describe('visibleRows', () => {
  it('shows only the root when nothing is expanded', () => {
    expect(visibleRows(tree, new Set())).toHaveLength(1);
  });

  it('opens one level at a time', () => {
    expect(labels({ activeId: ROOT_ID, expanded: defaultExpanded(tree, 0) })).toEqual([
      'root',
      '  name',
      '  version',
      '  stable',
      '  notes',
      '  tags',
      '  window',
    ]);
  });

  it('opens everything for Expand All', () => {
    expect(labels({ activeId: ROOT_ID, expanded: containerIds(tree) })).toEqual([
      'root',
      '  name',
      '  version',
      '  stable',
      '  notes',
      '  tags',
      '    0',
      '    1',
      '  window',
      '    width',
      '    height',
    ]);
  });

  it('reports position among siblings for assistive technology', () => {
    const rows = visibleRows(tree, containerIds(tree));
    const second = rows[2];
    expect(second).toMatchObject({ depth: 1, posInSet: 2, setSize: 6, parentId: ROOT_ID });
  });

  it('does not offer to expand an empty container', () => {
    const empty = buildJsonTree({ a: {} });
    const rows = visibleRows(empty, containerIds(empty));
    expect(rows[1]?.expandable).toBe(false);
  });
});

describe('navigate', () => {
  const open = () => ({ activeId: ROOT_ID, expanded: defaultExpanded(tree, 0) }) as TreeState;

  it('walks down and up the visible rows', () => {
    const rows = visibleRows(tree, open().expanded);
    const down = navigate(rows, open(), 'ArrowDown');
    expect(down?.activeId).toBe(rows[1]?.node.id);
    expect(
      navigate(rows, { ...open(), activeId: rows[1]?.node.id ?? '' }, 'ArrowUp')?.activeId,
    ).toBe(ROOT_ID);
  });

  it('stops at both ends', () => {
    const rows = visibleRows(tree, open().expanded);
    expect(navigate(rows, open(), 'ArrowUp')?.activeId).toBe(ROOT_ID);
    const last = rows[rows.length - 1]?.node.id ?? '';
    expect(navigate(rows, { ...open(), activeId: last }, 'ArrowDown')?.activeId).toBe(last);
    expect(navigate(rows, open(), 'End')?.activeId).toBe(last);
    expect(navigate(rows, { ...open(), activeId: last }, 'Home')?.activeId).toBe(ROOT_ID);
  });

  it('opens a closed node with the right arrow, then steps into it', () => {
    const state = { activeId: ROOT_ID, expanded: new Set<string>() };
    const opened = navigate(visibleRows(tree, state.expanded), state, 'ArrowRight');
    expect(opened?.expanded.has(ROOT_ID)).toBe(true);
    expect(opened?.activeId).toBe(ROOT_ID);
    const stepped = navigate(
      visibleRows(tree, opened?.expanded ?? new Set()),
      opened as TreeState,
      'ArrowRight',
    );
    expect(stepped?.activeId).toBe(`${ROOT_ID}.0`);
  });

  it('closes an open node with the left arrow, then steps out to the parent', () => {
    const state = open();
    const closed = navigate(visibleRows(tree, state.expanded), state, 'ArrowLeft');
    expect(closed?.expanded.has(ROOT_ID)).toBe(false);
    const child = { ...state, activeId: `${ROOT_ID}.0` };
    expect(navigate(visibleRows(tree, state.expanded), child, 'ArrowLeft')?.activeId).toBe(ROOT_ID);
  });

  it('toggles with Enter and leaves leaves alone', () => {
    const state = open();
    const rows = visibleRows(tree, state.expanded);
    expect(navigate(rows, state, 'Enter')?.expanded.has(ROOT_ID)).toBe(false);
    const leaf = { ...state, activeId: `${ROOT_ID}.0` };
    expect(navigate(rows, leaf, 'Enter')).toBeNull();
    expect(navigate(rows, leaf, 'ArrowRight')).toBeNull();
  });

  it('ignores keys it does not own, and an empty tree', () => {
    const state = open();
    expect(navigate(visibleRows(tree, state.expanded), state, 'x')).toBeNull();
    expect(navigate([], state, 'ArrowDown')).toBeNull();
  });

  it('recovers when the active row has gone away', () => {
    const state = { ...open(), activeId: 'missing' };
    expect(navigate(visibleRows(tree, state.expanded), state, 'ArrowDown')?.activeId).toBe(ROOT_ID);
  });
});
