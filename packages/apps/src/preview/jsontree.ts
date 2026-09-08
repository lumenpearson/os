/**
 * The model behind the JSON tree: a parsed document becomes nodes, the set of
 * expanded ids turns those nodes into the visible rows, and one reducer maps
 * a key press to the next active row. The component only draws.
 */

export type JsonKind = 'object' | 'array' | 'string' | 'number' | 'boolean' | 'null';

export interface JsonNode {
  /** Position in the tree; unique whatever the keys are called. */
  id: string;
  /** Object key, array index, or the root label. */
  label: string;
  kind: JsonKind;
  /** The leaf value, or how many members a container has. */
  summary: string;
  children: JsonNode[];
}

export interface JsonRow {
  node: JsonNode;
  depth: number;
  expandable: boolean;
  expanded: boolean;
  parentId: string | null;
  /** Siblings at this level, for `aria-setsize` and `aria-posinset`. */
  setSize: number;
  posInSet: number;
}

export const ROOT_ID = '0';

export function jsonKind(value: unknown): JsonKind {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'object':
      return 'object';
    case 'string':
      return 'string';
    case 'number':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'null';
  }
}

/** How a leaf reads in the value column. Strings keep their quotes. */
export function formatLeaf(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return String(value);
  return '';
}

function plural(count: number, one: string, many: string): string {
  if (count === 0) return 'empty';
  return `${count} ${count === 1 ? one : many}`;
}

export function buildJsonTree(value: unknown, label = 'root'): JsonNode {
  return build(value, label, ROOT_ID);
}

function build(value: unknown, label: string, id: string): JsonNode {
  const kind = jsonKind(value);
  if (kind === 'array') {
    const items = value as unknown[];
    return {
      id,
      label,
      kind,
      summary: plural(items.length, 'item', 'items'),
      children: items.map((item, i) => build(item, String(i), `${id}.${i}`)),
    };
  }
  if (kind === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return {
      id,
      label,
      kind,
      summary: plural(entries.length, 'key', 'keys'),
      children: entries.map(([key, child], i) => build(child, key, `${id}.${i}`)),
    };
  }
  return { id, label, kind, summary: formatLeaf(value), children: [] };
}

export function isContainer(node: JsonNode): boolean {
  return node.kind === 'object' || node.kind === 'array';
}

/** Every container id, for Expand All. */
export function containerIds(root: JsonNode): Set<string> {
  const ids = new Set<string>();
  const walk = (node: JsonNode) => {
    if (!isContainer(node)) return;
    ids.add(node.id);
    for (const child of node.children) walk(child);
  };
  walk(root);
  return ids;
}

/** Open the root and everything above `depth` levels down. */
export function defaultExpanded(root: JsonNode, depth = 1): Set<string> {
  const ids = new Set<string>();
  const walk = (node: JsonNode, level: number) => {
    if (!isContainer(node) || level > depth) return;
    ids.add(node.id);
    for (const child of node.children) walk(child, level + 1);
  };
  walk(root, 0);
  return ids;
}

/** The rows on screen, in order, given which containers are open. */
export function visibleRows(root: JsonNode, expanded: ReadonlySet<string>): JsonRow[] {
  const rows: JsonRow[] = [];
  const walk = (
    node: JsonNode,
    depth: number,
    parentId: string | null,
    pos: number,
    of: number,
  ) => {
    const expandable = isContainer(node) && node.children.length > 0;
    const open = expandable && expanded.has(node.id);
    rows.push({ node, depth, expandable, expanded: open, parentId, setSize: of, posInSet: pos });
    if (!open) return;
    node.children.forEach((child, i) => {
      walk(child, depth + 1, node.id, i + 1, node.children.length);
    });
  };
  walk(root, 0, null, 1, 1);
  return rows;
}

export interface TreeState {
  activeId: string;
  expanded: ReadonlySet<string>;
}

function withId(expanded: ReadonlySet<string>, id: string, present: boolean): Set<string> {
  const next = new Set(expanded);
  if (present) next.add(id);
  else next.delete(id);
  return next;
}

/**
 * Tree keyboard model, as WAI-ARIA describes it: down and up walk the visible
 * rows, right opens a closed node then steps into it, left closes an open one
 * then steps out, Enter toggles.
 */
export function navigate(
  rows: readonly JsonRow[],
  state: TreeState,
  key: string,
): TreeState | null {
  if (rows.length === 0) return null;
  const index = rows.findIndex((r) => r.node.id === state.activeId);
  const current = rows[index] ?? rows[0];
  if (!current) return null;
  const at = (i: number): TreeState => ({
    ...state,
    activeId: (rows[Math.max(0, Math.min(rows.length - 1, i))] ?? current).node.id,
  });

  switch (key) {
    case 'ArrowDown':
      return at(index + 1);
    case 'ArrowUp':
      return at(index - 1);
    case 'Home':
      return at(0);
    case 'End':
      return at(rows.length - 1);
    case 'ArrowRight':
      if (!current.expandable) return null;
      if (!current.expanded)
        return {
          activeId: current.node.id,
          expanded: withId(state.expanded, current.node.id, true),
        };
      return at(index + 1);
    case 'ArrowLeft':
      if (current.expandable && current.expanded)
        return {
          activeId: current.node.id,
          expanded: withId(state.expanded, current.node.id, false),
        };
      if (current.parentId === null) return null;
      return { ...state, activeId: current.parentId };
    case 'Enter':
    case ' ':
      if (!current.expandable) return null;
      return {
        activeId: current.node.id,
        expanded: withId(state.expanded, current.node.id, !current.expanded),
      };
    default:
      return null;
  }
}
