import { cx } from '@lumen/ui';
import { type DirEntry, dirname } from '@lumen/vfs';
import { ChevronRight } from 'lucide-react';
import { type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { FileTypeIcon, useDirectory } from '../_sdk';
import { EntryListBox, rowClasses } from './EntryListBox';
import { FilePreview } from './FilePreview';
import { sortPlanFor, sortWithPlan } from './filters';
import { type Selection, type SortState, selectOnly } from './logic';
import { RenameInput } from './RenameInput';
import type { EntryHandlers, EntryViewState } from './types';

export interface ColumnViewProps extends EntryHandlers, EntryViewState {
  path: string;
  /** Folders opened to the right of `path`, each a child of the previous. */
  trail: readonly string[];
  onTrailChange: (trail: string[]) => void;
  showHidden: boolean;
  sort: SortState;
  foldersFirst: boolean;
}

/**
 * Miller columns: the folder, then one column per opened subfolder, then a
 * preview of the selected file. Selecting a folder opens the next column.
 */
export function ColumnView(props: ColumnViewProps) {
  const { path, trail, onTrailChange, selection, onSelectionChange } = props;
  const columns = useMemo(() => [path, ...trail], [path, trail]);
  const scroller = useRef<HTMLDivElement>(null);
  const entriesByDepth = useRef(new Map<number, readonly DirEntry[]>());
  const [focusDepth, setFocusDepth] = useState<number | null>(null);
  const base = useId();
  const columnId = (depth: number) => `${base}-col-${depth}`;

  const single = selection.keys.size === 1 ? [...selection.keys][0] : undefined;
  const previewPath = useMemo(() => {
    if (single === undefined) return null;
    const depth = columns.indexOf(dirname(single));
    const entry =
      depth >= 0 ? entriesByDepth.current.get(depth)?.find((e) => e.path === single) : undefined;
    return entry && entry.kind === 'file' ? single : null;
  }, [single, columns]);

  /** Reveal the rightmost pane whenever a column opens or the preview changes. */
  useEffect(() => {
    const el = scroller.current;
    const last = previewPath ?? columns[columns.length - 1];
    if (el && last) el.scrollLeft = el.scrollWidth;
  }, [columns, previewPath]);

  useEffect(() => {
    if (focusDepth === null) return;
    document.getElementById(`${base}-col-${focusDepth}`)?.focus({ preventScroll: true });
    setFocusDepth(null);
  }, [focusDepth, base]);

  const pick = (depth: number, sel: Selection, entries: readonly DirEntry[]) => {
    onSelectionChange(sel);
    const only = sel.keys.size === 1 ? [...sel.keys][0] : undefined;
    const entry = only !== undefined ? entries.find((e) => e.path === only) : undefined;
    const next = trail.slice(0, depth);
    if (entry?.kind === 'directory') next.push(entry.path);
    onTrailChange(next);
  };

  const stepRight = (depth: number) => {
    const first = entriesByDepth.current.get(depth + 1)?.[0];
    if (!first || columns[depth + 1] === undefined) return;
    onSelectionChange(selectOnly(first.path));
    setFocusDepth(depth + 1);
  };

  const stepLeft = (depth: number) => {
    const parent = columns[depth];
    if (depth === 0 || parent === undefined) return;
    onSelectionChange(selectOnly(parent));
    setFocusDepth(depth - 1);
  };

  return (
    <div ref={scroller} className="lumen-scroll flex h-full">
      {columns.map((p, depth) => (
        <ColumnList
          key={p}
          {...props}
          id={columnId(depth)}
          path={p}
          openChild={columns[depth + 1] ?? null}
          onEntries={(entries) => entriesByDepth.current.set(depth, entries)}
          onPick={(sel, entries) => pick(depth, sel, entries)}
          onStepRight={() => stepRight(depth)}
          onStepLeft={() => stepLeft(depth)}
        />
      ))}
      {previewPath && (
        <div className="w-64 shrink-0 border-r border-rule bg-surface">
          <FilePreview path={previewPath} />
        </div>
      )}
    </div>
  );
}

interface ColumnListProps extends EntryHandlers, EntryViewState {
  id: string;
  path: string;
  openChild: string | null;
  showHidden: boolean;
  sort: SortState;
  foldersFirst: boolean;
  onEntries: (entries: readonly DirEntry[]) => void;
  onPick: (sel: Selection, entries: readonly DirEntry[]) => void;
  onStepRight: () => void;
  onStepLeft: () => void;
}

function ColumnList({
  id,
  path,
  openChild,
  showHidden,
  sort,
  foldersFirst,
  selection,
  renaming,
  cutPaths,
  dropTarget,
  focused,
  onEntries,
  onPick,
  onStepRight,
  onStepLeft,
  onOpen,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  onRenameCommit,
  onRenameCancel,
}: ColumnListProps) {
  const dir = useDirectory(path, { showHidden });
  const entries = useMemo(
    () => sortWithPlan(dir.entries, sortPlanFor(sort, foldersFirst)),
    [dir.entries, sort, foldersFirst],
  );
  const [hasFocus, setHasFocus] = useState(false);
  onEntries(entries);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      onStepRight();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onStepLeft();
    }
  };

  return (
    <EntryListBox
      id={id}
      entries={entries}
      selection={selection}
      layout="rows"
      label={path}
      className="flex h-full w-56 shrink-0 flex-col gap-px border-r border-rule p-1"
      onSelectionChange={(sel) => onPick(sel, entries)}
      onOpen={onOpen}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onKeyDown={onKeyDown}
      onFocusChange={setHasFocus}
      itemClassName={(entry, s) =>
        cx(
          'flex h-6 items-center gap-2 rounded-xs px-2',
          s.selected
            ? rowClasses(true, focused && hasFocus)
            : entry.path === openChild && 'bg-selection',
          s.cursor && !s.selected && 'outline-2 -outline-offset-2 outline-accent',
          entry.path === dropTarget && 'bg-selection outline-2 -outline-offset-2 outline-accent',
          cutPaths.has(entry.path) && 'opacity-50',
        )
      }
      renderItem={(entry) => (
        <>
          <FileTypeIcon entry={entry} size={16} />
          {renaming === entry.path ? (
            <RenameInput
              path={entry.path}
              onCommit={(name) => onRenameCommit(entry.path, name)}
              onCancel={onRenameCancel}
            />
          ) : (
            <span className="truncate-1 flex-1">{entry.name}</span>
          )}
          {entry.kind === 'directory' && (
            <ChevronRight aria-hidden className="size-3.5 shrink-0 opacity-60" />
          )}
        </>
      )}
    >
      {dir.error && <p className="p-3 text-sm text-danger">{dir.error.message}</p>}
      {!dir.error && !dir.loading && entries.length === 0 && (
        <p className="p-3 text-center text-sm text-ink-3">Empty</p>
      )}
    </EntryListBox>
  );
}
