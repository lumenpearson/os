import { cx } from '@lumen/ui';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { parseJsonDocument } from '../document';
import {
  buildJsonTree,
  defaultExpanded,
  type JsonKind,
  type JsonRow,
  navigate,
  ROOT_ID,
  visibleRows,
} from '../jsontree';
import { TextView, Truncation } from './TextView';

export interface JsonViewProps {
  text: string;
  /** The file name: the accessible name of the tree. */
  name: string;
  dropped?: number;
}

/** Leaves read in the colour of their type; containers are quieter than keys. */
const VALUE_TONE: Record<JsonKind, string> = {
  string: 'text-ink',
  number: 'text-ink',
  boolean: 'text-ink',
  null: 'text-ink-3',
  object: 'text-ink-3',
  array: 'text-ink-3',
};

const INDENT = 14;

/**
 * The JSON tree: one row per visible node, arrow keys to walk it, Enter to
 * open and close. Which rows exist and where a key press lands are decided in
 * `jsontree.ts`; this only draws and reports the click.
 */
export function JsonView({ text, name, dropped = 0 }: JsonViewProps) {
  const parsed = useMemo(() => parseJsonDocument(text), [text]);
  if (!parsed.ok) return <TextView text={text} name={name} dropped={dropped} />;
  return <Tree value={parsed.value} name={name} dropped={dropped} />;
}

function Tree({ value, name, dropped }: { value: unknown; name: string; dropped: number }) {
  const prefix = useId();
  const root = useMemo(() => buildJsonTree(value, 'root'), [value]);
  const [expanded, setExpanded] = useState(() => defaultExpanded(root, 1));
  const [activeId, setActiveId] = useState(ROOT_ID);
  const rows = useMemo(() => visibleRows(root, expanded), [root, expanded]);
  const list = useRef<HTMLDivElement>(null);

  // A new document is a new tree; the old open set means nothing in it.
  useEffect(() => {
    setExpanded(defaultExpanded(root, 1));
    setActiveId(ROOT_ID);
  }, [root]);

  const rowId = (id: string) => `${prefix}-${id}`;

  useEffect(() => {
    list.current?.querySelector(`#${CSS.escape(rowId(activeId))}`)?.scrollIntoView({
      block: 'nearest',
    });
  });

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const next = navigate(rows, { activeId, expanded }, event.key);
    if (!next) return;
    event.preventDefault();
    event.stopPropagation();
    setActiveId(next.activeId);
    if (next.expanded !== expanded) setExpanded(new Set(next.expanded));
  };

  const toggle = (row: JsonRow) => {
    setActiveId(row.node.id);
    if (!row.expandable) return;
    setExpanded((current) => {
      const copy = new Set(current);
      if (copy.has(row.node.id)) copy.delete(row.node.id);
      else copy.add(row.node.id);
      return copy;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <div
        ref={list}
        role="tree"
        tabIndex={0}
        aria-label={name}
        aria-activedescendant={rowId(activeId)}
        onKeyDown={onKeyDown}
        className="lumen-scroll mono min-h-0 flex-1 py-1 text-sm lumen-focus focus-visible:-outline-offset-2"
      >
        {rows.map((row) => (
          <Row
            key={row.node.id}
            row={row}
            id={rowId(row.node.id)}
            active={row.node.id === activeId}
            onSelect={() => toggle(row)}
          />
        ))}
      </div>
      {dropped > 0 && <Truncation dropped={dropped} />}
    </div>
  );
}

function Row({
  row,
  id,
  active,
  onSelect,
}: {
  row: JsonRow;
  id: string;
  active: boolean;
  onSelect: () => void;
}) {
  const Chevron = row.expanded ? ChevronDown : ChevronRight;
  return (
    // biome-ignore lint/a11y/useFocusableInteractive: the tree is the tab stop and points at the active row with aria-activedescendant
    <div
      id={id}
      role="treeitem"
      aria-level={row.depth + 1}
      aria-expanded={row.expandable ? row.expanded : undefined}
      aria-setsize={row.setSize}
      aria-posinset={row.posInSet}
      aria-selected={active}
      onClick={onSelect}
      style={{ paddingLeft: row.depth * INDENT + 6 }}
      className={cx(
        'flex h-5.5 min-w-0 cursor-default items-center gap-1.5 rounded-xs pr-3',
        active ? 'bg-selection text-ink' : 'hover:bg-surface-2',
      )}
    >
      <span className="flex size-3.5 shrink-0 items-center justify-center text-ink-3">
        {row.expandable && <Chevron aria-hidden className="size-3.5" />}
      </span>
      <span className="shrink-0 text-ink-2">{row.node.label}</span>
      <span aria-hidden className="shrink-0 text-ink-3">
        :
      </span>
      <span className={cx('truncate-1 tabular-nums', VALUE_TONE[row.node.kind])}>
        {row.node.summary}
      </span>
    </div>
  );
}
