import { Check, ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../cx';
import { useClickOutside, useEscape } from '../hooks';

export interface MenuEntry {
  id?: string;
  type?: 'item' | 'separator' | 'submenu' | 'checkbox' | 'radio';
  label?: string;
  /** Pre-formatted shortcut text ("Ctrl+S" / "⌘S"). */
  shortcut?: string;
  icon?: ReactNode;
  enabled?: boolean;
  checked?: boolean;
  danger?: boolean;
  onSelect?: () => void;
  submenu?: MenuEntry[];
}

export interface MenuListProps {
  items: MenuEntry[];
  onClose: () => void;
  /** Called after any item is selected (before onClose). */
  onSelect?: (item: MenuEntry) => void;
  autoFocus?: boolean;
  className?: string;
  minWidth?: number;
}

/**
 * A menu list with full keyboard navigation and nested submenus. Used by
 * the menubar, context menus, and toolbar dropdowns.
 */
export function MenuList({
  items,
  onClose,
  onSelect,
  autoFocus = true,
  className,
  minWidth,
}: MenuListProps) {
  const [active, setActive] = useState(-1);
  const [openSub, setOpenSub] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const selectable = useMemo(
    () =>
      items
        .map((it, i) => (it.type !== 'separator' && it.enabled !== false ? i : -1))
        .filter((i) => i >= 0),
    [items],
  );

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const activate = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item || item.enabled === false) return;
      if (item.type === 'submenu' || item.submenu) {
        setActive(index);
        setOpenSub(index);
        return;
      }
      item.onSelect?.();
      onSelect?.(item);
      onClose();
    },
    [items, onClose, onSelect],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (openSub !== null && (e.key === 'ArrowRight' || e.key === 'Enter')) return;
    const pos = selectable.indexOf(active);
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        setActive(selectable[(pos + 1) % selectable.length] ?? -1);
        setOpenSub(null);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setActive(selectable[(pos - 1 + selectable.length) % selectable.length] ?? -1);
        setOpenSub(null);
        break;
      }
      case 'Home':
        e.preventDefault();
        setActive(selectable[0] ?? -1);
        break;
      case 'End':
        e.preventDefault();
        setActive(selectable[selectable.length - 1] ?? -1);
        break;
      case 'ArrowRight':
        if (active >= 0 && items[active]?.submenu) {
          e.preventDefault();
          setOpenSub(active);
        }
        break;
      case 'ArrowLeft':
        if (openSub !== null) {
          e.preventDefault();
          setOpenSub(null);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (active >= 0) activate(active);
        break;
      default: {
        if (e.key.length === 1) {
          const k = e.key.toLowerCase();
          const idx = selectable.find((i) => items[i]?.label?.toLowerCase().startsWith(k));
          if (idx !== undefined) setActive(idx);
        }
      }
    }
  };

  return (
    <div
      ref={ref}
      role="menu"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      className={cx('lumen-menu outline-none lumen-pop-enter', className)}
      style={minWidth ? { minWidth } : undefined}
    >
      {items.map((item, i) => {
        if (item.type === 'separator')
          return <hr key={item.id ?? `sep-${i}`} className="lumen-menu-separator" />;
        const disabled = item.enabled === false;
        const hasSub = Boolean(item.submenu);
        const checked = item.checked;
        return (
          // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-checked and the menuitemcheckbox/menuitemradio role both come from item.type
          <div
            key={item.id ?? `${item.label}-${i}`}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            role={
              item.type === 'checkbox'
                ? 'menuitemcheckbox'
                : item.type === 'radio'
                  ? 'menuitemradio'
                  : 'menuitem'
            }
            aria-checked={
              item.type === 'checkbox' || item.type === 'radio' ? Boolean(checked) : undefined
            }
            aria-disabled={disabled || undefined}
            aria-haspopup={hasSub ? 'menu' : undefined}
            aria-expanded={hasSub ? openSub === i : undefined}
            data-active={active === i}
            data-danger={item.danger || undefined}
            className="lumen-menu-item"
            onPointerEnter={() => {
              if (disabled) return;
              setActive(i);
              setOpenSub(hasSub ? i : null);
            }}
            onPointerUp={(e) => {
              if (e.button !== 0 || disabled) return;
              e.stopPropagation();
              activate(i);
            }}
          >
            {(checked || item.icon) && (
              <span className="absolute left-1.5 top-1/2 -translate-y-1/2 [&>svg]:size-3.5">
                {checked ? <Check strokeWidth={2.5} /> : item.icon}
              </span>
            )}
            <span className="truncate-1">{item.label}</span>
            {item.shortcut && <span className="lumen-menu-shortcut">{item.shortcut}</span>}
            {hasSub && <ChevronRight aria-hidden className="ml-auto size-3.5 text-ink-3" />}
            {hasSub && openSub === i && item.submenu && (
              <Submenu
                anchor={itemRefs.current[i] ?? null}
                items={item.submenu}
                onClose={onClose}
                onSelect={onSelect}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Submenu({
  anchor,
  items,
  onClose,
  onSelect,
}: {
  anchor: HTMLDivElement | null;
  items: MenuEntry[];
  onClose: () => void;
  onSelect?: (i: MenuEntry) => void;
}) {
  const rect = anchor?.getBoundingClientRect();
  if (!rect) return null;
  const width = 220;
  const left = rect.right + width > window.innerWidth ? rect.left - width : rect.right - 2;
  return createPortal(
    <div
      className="fixed z-[1101]"
      style={{ left, top: rect.top - 5 }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <MenuList
        items={items}
        onClose={onClose}
        onSelect={onSelect}
        autoFocus={false}
        minWidth={width}
      />
    </div>,
    document.body,
  );
}

export interface AnchoredMenuProps {
  open: boolean;
  onClose: () => void;
  items: MenuEntry[];
  /** Screen position for context menus, or an element to anchor under. */
  at?: { x: number; y: number } | null;
  anchor?: HTMLElement | null;
  align?: 'start' | 'end';
  onSelect?: (item: MenuEntry) => void;
}

/** Positions a MenuList at a point or under an anchor, flipped to stay on screen. */
export function AnchoredMenu({
  open,
  onClose,
  items,
  at,
  anchor,
  align = 'start',
  onSelect,
}: AnchoredMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const refs = useMemo(() => [ref], []);
  useClickOutside(refs, onClose, open);
  useEscape(onClose, open);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const el = ref.current;
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? 200;
    let left = 0;
    let top = 0;
    if (at) {
      left = at.x;
      top = at.y;
    } else if (anchor) {
      const r = anchor.getBoundingClientRect();
      left = align === 'end' ? r.right - w : r.left;
      top = r.bottom + 4;
    }
    left = Math.max(4, Math.min(left, window.innerWidth - w - 4));
    top = Math.max(4, Math.min(top, window.innerHeight - h - 4));
    setPos({ left, top });
  }, [open, at, anchor, align]);

  if (!open || typeof document === 'undefined') return null;
  return createPortal(
    <div
      ref={ref}
      className="fixed z-[1100]"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuList items={items} onClose={onClose} onSelect={onSelect} />
    </div>,
    document.body,
  );
}

/** Convenience for context menus: returns state + handlers for `onContextMenu`. */
export function useContextMenu() {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  const openAt = useCallback(
    (e: { preventDefault: () => void; clientX: number; clientY: number }) => {
      e.preventDefault();
      setAt({ x: e.clientX, y: e.clientY });
    },
    [],
  );
  const close = useCallback(() => setAt(null), []);
  return { at, open: at !== null, openAt, close };
}
