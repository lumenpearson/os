import { boxesByPath, useMarquee } from '@lumen/kernel/react';
import { cx } from '@lumen/ui';
import type { DirEntry } from '@lumen/vfs';
import {
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
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
  revealOffset,
  type Selection,
  selectAll,
  selectClick,
  selectOnly,
} from './logic';

export interface ItemState {
  selected: boolean;
  /** The item the keyboard would act on, and the list has the keyboard. */
  cursor: boolean;
  /**
   * The item the keyboard would act on whether or not the list has the
   * keyboard. A list that marks nothing until it is focused leaves a person
   * guessing where an arrow key would take them, so views draw this too —
   * quietly, so the focused cursor is still the louder of the two.
   */
  atCursor: boolean;
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
  /** Per-item inline style, for sizes that animate (the card lane). */
  itemStyle?: (entry: DirEntry, state: ItemState) => CSSProperties | undefined;
  /** Announced on the listbox; a card lane running left to right is horizontal. */
  orientation?: 'horizontal' | 'vertical';
  /** Runs before the built-in keys; call preventDefault to claim a key. */
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void;
  /**
   * How the cursor is brought into view when it moves. The scrolling is done
   * to the list's own container and to nothing above it — see `revealOffset`.
   */
  reveal?: { align?: 'nearest' | 'center'; smooth?: boolean };
  /** The scrolling element, for views that drive it themselves (the card lane). */
  containerRef?: RefObject<HTMLDivElement | null>;
  onFocusChange?: (focused: boolean) => void;
  /**
   * Dragging over empty space in the list draws a selection rectangle. Off
   * where the list is not the thing being selected in — a column that only
   * picks one entry, or a lane that scrolls under the pointer.
   */
  marquee?: boolean;
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
  itemStyle,
  orientation,
  onKeyDown,
  reveal = { align: 'nearest' },
  containerRef,
  onFocusChange,
  marquee = false,
  className,
  children,
}: EntryListBoxProps) {
  const base = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [hasFocus, setHasFocus] = useState(false);
  const order = useMemo(() => entries.map((e) => e.path), [entries]);
  const cursorIndex = selection.cursor !== null ? order.indexOf(selection.cursor) : -1;
  const idFor = (i: number) => `${base}-${i}`;

  const bandRef = useRef<HTMLDivElement>(null);
  /**
   * The rectangle keeps the anchor and the cursor the selection already had:
   * a band picks a set, it does not say where a Shift range should start from
   * next, and the entries it covers are in the list's own order anyway.
   */
  const band = useMarquee({
    layer: ref,
    band: bandRef,
    boxes: () => (ref.current ? boxesByPath(ref.current) : []),
    current: () => selection.keys,
    onChange: (keys) => onSelectionChange({ ...selection, keys: new Set(keys) }),
  });

  // `reveal` is a fresh object every render; only a cursor move should scroll.
  const revealRef = useRef(reveal);
  revealRef.current = reveal;
  useEffect(() => {
    if (cursorIndex < 0) return;
    const port = containerRef?.current ?? ref.current;
    const item = ref.current?.querySelector<HTMLElement>(`[data-index="${cursorIndex}"]`);
    if (!port || !item) return;
    const { align = 'nearest', smooth = false } = revealRef.current;
    const portBox = port.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    // Item coordinates in the port's own scrolled content, which is what
    // `revealOffset` reasons about. Reading the boxes rather than `offsetLeft`
    // keeps it right whatever the offset parent turns out to be.
    const left = revealOffset(
      { start: itemBox.left - portBox.left + port.scrollLeft, size: itemBox.width },
      { scroll: port.scrollLeft, size: port.clientWidth, content: port.scrollWidth },
      align,
    );
    const top = revealOffset(
      { start: itemBox.top - portBox.top + port.scrollTop, size: itemBox.height },
      { scroll: port.scrollTop, size: port.clientHeight, content: port.scrollHeight },
      align,
    );
    if (left === port.scrollLeft && top === port.scrollTop) return;
    port.scrollTo({ left, top, behavior: smooth ? 'smooth' : 'auto' });
  }, [cursorIndex, containerRef]);

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
      onSelectionChange(
        e.shiftKey ? selectClick(selection, order, key, { shift: true }) : selectOnly(key),
      );
      return;
    }
    const step =
      e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : e.key === 'Home' ? 'home' : 'end';
    onSelectionChange(moveSelection(selection, order, step, e.shiftKey));
  };

  return (
    <div
      ref={(el) => {
        ref.current = el;
        if (containerRef) containerRef.current = el;
      }}
      id={id}
      role="listbox"
      aria-label={label}
      aria-orientation={orientation}
      aria-multiselectable
      aria-activedescendant={cursorIndex >= 0 ? idFor(cursorIndex) : undefined}
      tabIndex={0}
      onKeyDown={handleKey}
      // Focus anywhere inside the list is the list having focus. Insisting
      // that the container itself be the target meant a click on a card —
      // which focuses the card, since every item is programmatically
      // focusable — left the list believing it was unfocused, so the cursor
      // never took the accent and the selection stayed in its grey state.
      onFocus={() => {
        if (hasFocus) return;
        setHasFocus(true);
        onFocusChange?.(true);
      }}
      onBlur={(e) => {
        // `relatedTarget` is where focus is going; still inside means the
        // list has not lost it, it has only moved within.
        if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
        setHasFocus(false);
        onFocusChange?.(false);
      }}
      onPointerDown={(e) => {
        if (!marquee || e.target !== e.currentTarget) return;
        band.start(e);
      }}
      className={cx('outline-none', marquee && 'relative', className)}
    >
      {marquee && (
        <div
          ref={bandRef}
          hidden
          aria-hidden
          data-testid="entry-marquee"
          className="pointer-events-none absolute top-0 left-0 z-10 origin-top-left border border-accent bg-accent/15"
        />
      )}
      {entries.map((entry, index) => {
        const state: ItemState = {
          selected: selection.keys.has(entry.path),
          cursor: hasFocus && index === cursorIndex,
          atCursor: index === cursorIndex,
          index,
        };
        return (
          <div
            key={entry.path}
            id={idFor(index)}
            role="option"
            aria-selected={state.selected}
            tabIndex={-1}
            data-index={index}
            data-path={entry.path}
            // The one item the keyboard will act on, named in the DOM so a
            // stylesheet and a test can both find it.
            data-cursor={state.cursor || undefined}
            data-at-cursor={state.atCursor || undefined}
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
            style={itemStyle?.(entry, state)}
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
