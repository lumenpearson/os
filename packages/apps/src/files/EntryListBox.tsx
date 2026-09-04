import { cx } from '@lumen/ui';
import type { DirEntry } from '@lumen/vfs';
import {
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  gridStep,
  isEditableTarget,
  moveSelection,
  selectAll,
  selectClick,
  type Selection,
  selectOnly,
} from './logic';

export interface ItemState {
  selected: boolean;
  cursor: boolean;
  index: number;
}

export interface EntryListBoxProps {
  entries: readonly DirEntry[];
  selection: Selection;
  layout: 'rows' | 'grid';
  label: string;
  id?: string;
  onSelectionChange: (sel: Selection) => void;
  onOpen: (entry: DirEntry) => void;
  onContextMenu: (entry: DirEntry, e: MouseEvent) => void;
  onDragStart: (entry: DirEntry, e: DragEvent) => void;
  onDragOver: (entry: DirEntry, e: DragEvent) => void;
  onDrop: (entry: DirEntry, e: DragEvent) => void;
  renderItem: (entry: DirEntry, state: ItemState) => ReactNode;
  itemClassName: (entry: DirEntry, state: ItemState) => string | undefined;
  /** Runs before the built-in keys; call preventDefault to claim a key. */
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  onFocusChange?: (focused: boolean) => void;
  className?: string;
  children?: ReactNode;
}

const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

/**
 * A multi-select listbox over directory entries, laid out as rows or as a
 * grid. Owns pointer selection (click / Shift / Ctrl) and arrow-key
 * navigation; the parent owns the selection state and everything else.
 */
export function EntryListBox({
  entries,
  selection,
  layout,
  label,
  id,
  onSelectionChange,
  onOpen,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDrop,
  renderItem,
  itemClassName,
  onKeyDown,
  onFocusChange,
  className,
  children,
}: EntryListBoxProps) {
  const base = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [hasFocus, setHasFocus] = useState(false);
  const order = useMemo(() => entries.map((e) => e.path), [entries]);
  const cursorIndex = selection.cursor !== null ? order.indexOf(selection.cursor) : -1;
  const idFor = (i: number) => `${base}-${i}`;

  useEffect(() => {
    if (cursorIndex < 0) return;
    ref.current
      ?.querySelector<HTMLElement>(`[data-index="${cursorIndex}"]`)
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [cursorIndex]);

  const columnCount = () => {
    const el = ref.current;
    if (!el || layout !== 'grid') return 1;
    return getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  };

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(e);
    if (e.defaultPrevented || isEditableTarget(e.target as Element)) return;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'a') {
      e.preventDefault();
      onSelectionChange(selectAll(order));
      return;
    }
    if (!NAV_KEYS.has(e.key) || order.length === 0 || mod) return;
    if (layout === 'rows' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    e.preventDefault();
    if (layout === 'grid') {
      const next = gridStep(cursorIndex, order.length, columnCount(), e.key);
      const key = order[next];
      if (key === undefined) return;
      onSelectionChange(e.shiftKey ? selectClick(selection, order, key, { shift: true }) : selectOnly(key));
      return;
    }
    const step = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : e.key === 'Home' ? 'home' : 'end';
    onSelectionChange(moveSelection(selection, order, step, e.shiftKey));
  };

  return (
    <div
      ref={ref}
      id={id}
      role="listbox"
      aria-label={label}
      aria-multiselectable
      aria-activedescendant={cursorIndex >= 0 ? idFor(cursorIndex) : undefined}
      tabIndex={0}
      onKeyDown={handleKey}
      onFocus={(e) => {
        if (e.target !== e.currentTarget) return;
        setHasFocus(true);
        onFocusChange?.(true);
      }}
      onBlur={(e) => {
        if (e.target !== e.currentTarget) return;
        setHasFocus(false);
        onFocusChange?.(false);
      }}
      className={cx('outline-none', className)}
    >
      {entries.map((entry, index) => {
        const state: ItemState = {
          selected: selection.keys.has(entry.path),
          cursor: hasFocus && index === cursorIndex,
          index,
        };
        return (
          <div
            key={entry.path}
            id={idFor(index)}
            role="option"
            aria-selected={state.selected}
            data-index={index}
            data-path={entry.path}
            draggable
            onDragStart={(e) => onDragStart(entry, e)}
            onDragOver={(e) => onDragOver(entry, e)}
            onDrop={(e) => onDrop(entry, e)}
            onPointerDown={(e) => {
              if (e.button === 2 && state.selected) return;
              if (e.button !== 0 && e.button !== 2) return;
              onSelectionChange(
                selectClick(selection, order, entry.path, {
                  shift: e.shiftKey,
                  toggle: e.metaKey || e.ctrlKey,
                }),
              );
            }}
            onDoubleClick={(e) => {
              if (e.button === 0) onOpen(entry);
            }}
            onContextMenu={(e) => onContextMenu(entry, e)}
            className={cx('select-none', itemClassName(entry, state))}
          >
            {renderItem(entry, state)}
          </div>
        );
      })}
      {children}
    </div>
  );
}

/** Row colours shared by the row-shaped views: grey when idle, accent when the window has focus. */
export function rowClasses(selected: boolean, focused: boolean): string | undefined {
  if (!selected) return undefined;
  return focused ? 'bg-accent text-accent-ink' : 'bg-selection';
}
