import {
  AnchoredMenu,
  cx,
  IconButton,
  isContextMenuKey,
  type MenuEntry,
  Spinner,
  useContextMenu,
} from '@lumen/ui';
import { Bookmark, Clock, Cog, File, Plus, Sparkle, X } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Tab } from './tabs';
import { internalPage, tabInitial } from './url';

export interface TabStripProps {
  tabs: readonly Tab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  /**
   * Open a second tab on the same address. Optional: without it the strip
   * offers no Duplicate rather than one that quietly opens the start page.
   */
  onDuplicate?: (id: string) => void;
}

export interface TabMenuActions {
  newTab: () => void;
  duplicate?: (id: string) => void;
  close: (id: string) => void;
}

/**
 * The menu behind a right-click on a tab. Closing several tabs is closing one
 * tab several times — the reducer in `tabs.ts` decides what that means for
 * the selection and for the last tab in the window — so all this works out is
 * which tabs are involved.
 */
export function tabMenuItems(
  tabs: readonly Tab[],
  id: string,
  actions: TabMenuActions,
): MenuEntry[] {
  const index = tabs.findIndex((t) => t.id === id);
  const others = tabs.filter((t) => t.id !== id).map((t) => t.id);
  const toTheRight = index < 0 ? [] : tabs.slice(index + 1).map((t) => t.id);
  const closeEach = (ids: string[]) => () => {
    for (const each of ids) actions.close(each);
  };
  const items: MenuEntry[] = [{ id: 'new-tab', label: 'New Tab', onSelect: actions.newTab }];
  if (actions.duplicate) {
    const duplicate = actions.duplicate;
    items.push({ id: 'duplicate', label: 'Duplicate Tab', onSelect: () => duplicate(id) });
  }
  items.push(
    { id: 'tab-sep', type: 'separator' },
    { id: 'close', label: 'Close Tab', onSelect: () => actions.close(id) },
    {
      id: 'close-others',
      label: 'Close Other Tabs',
      enabled: others.length > 0,
      onSelect: closeEach(others),
    },
    {
      id: 'close-right',
      label: 'Close Tabs to the Right',
      enabled: toTheRight.length > 0,
      onSelect: closeEach(toTheRight),
    },
  );
  return items;
}

const PAGE_GLYPHS = {
  start: Sparkle,
  history: Clock,
  bookmarks: Bookmark,
  settings: Cog,
  blank: File,
} as const;

/**
 * The tab row. The first 72px stay empty: the window's controls float there.
 * Tabs are a tablist — one tab stop, arrows move between them — and each
 * carries its own close button so the mouse and the keyboard agree.
 */
export function TabStrip({ tabs, activeId, onSelect, onClose, onNew, onDuplicate }: TabStripProps) {
  const strip = useRef<HTMLDivElement>(null);
  const menu = useContextMenu();
  const [menuTab, setMenuTab] = useState<string | null>(null);
  const items = menuTab
    ? tabMenuItems(tabs, menuTab, { newTab: onNew, duplicate: onDuplicate, close: onClose })
    : [];

  // Keep the active tab in view when the strip is crowded enough to scroll.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the selected tab is read from the DOM, so activeId is the trigger
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, index: number) => {
    const tab = tabs[index];
    if (tab && isContextMenuKey(e)) {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      setMenuTab(tab.id);
      menu.openAtPoint(rect.left + 8, rect.bottom - 2);
      return;
    }
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (step !== 0) {
      e.preventDefault();
      const next = tabs[(index + step + tabs.length) % tabs.length];
      if (next) onSelect(next.id);
      return;
    }
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const next = e.key === 'Home' ? tabs[0] : tabs[tabs.length - 1];
      if (next) onSelect(next.id);
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (tab) onSelect(tab.id);
    }
  };

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 border-b border-rule bg-canvas pr-1 pl-18">
      <div
        ref={strip}
        role="tablist"
        aria-label="Tabs"
        aria-orientation="horizontal"
        className="lumen-scroll flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden pb-px"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === activeId;
          const page = internalPage(tab.url);
          const Glyph = page ? PAGE_GLYPHS[page] : null;
          return (
            // A tab is a `tab` role in a tablist, not a button: the strip owns
            // one tab stop and onKeyDown below moves between them.
            <div
              key={tab.id}
              role="tab"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              title={tab.title}
              onClick={() => onSelect(tab.id)}
              onKeyDown={(e) => onKeyDown(e, index)}
              onMouseDown={(e: MouseEvent) => {
                // stop the middle-click autoscroll before it starts
                if (e.button === 1) e.preventDefault();
              }}
              onAuxClick={(e: MouseEvent) => {
                if (e.button === 1) onClose(tab.id);
              }}
              onContextMenu={(e) => {
                setMenuTab(tab.id);
                menu.openAt(e);
              }}
              className={cx(
                'group flex h-7 w-44 min-w-24 shrink cursor-default items-center gap-1.5 rounded-sm px-2 lumen-focus select-none',
                'transition-colors duration-(--duration-fast) ease-(--ease-standard)',
                selected
                  ? 'bg-surface text-ink shadow-sm'
                  : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
              )}
            >
              <span className="flex size-4 shrink-0 items-center justify-center" aria-hidden>
                {tab.status === 'loading' ? (
                  <Spinner size={12} />
                ) : Glyph ? (
                  <Glyph className="size-3.5" />
                ) : (
                  <span className="mono flex size-4 items-center justify-center rounded-xs bg-surface-3 text-2xs text-ink-2">
                    {tabInitial(tab.url)}
                  </span>
                )}
              </span>
              <span className="truncate-1 flex-1 text-sm">{tab.title}</span>
              <button
                type="button"
                aria-label={`Close ${tab.title}`}
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                className={cx(
                  'inline-flex size-4 shrink-0 items-center justify-center rounded-xs text-ink-3 lumen-focus',
                  'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100',
                  'hover:bg-surface-3 hover:text-ink',
                  selected && 'opacity-100',
                )}
              >
                <X className="size-3" aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
      <IconButton label="New tab" size="sm" onClick={onNew}>
        <Plus />
      </IconButton>
      <AnchoredMenu open={menu.open} at={menu.at} items={items} onClose={menu.close} />
    </div>
  );
}
