import { cx, IconButton, Spinner } from '@lumen/ui';
import { Bookmark, Clock, Cog, Plus, Sparkle, X } from 'lucide-react';
import type { KeyboardEvent, MouseEvent } from 'react';
import { useEffect, useRef } from 'react';
import type { Tab } from './tabs';
import { internalPage, tabInitial } from './url';

export interface TabStripProps {
  tabs: readonly Tab[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
}

const PAGE_GLYPHS = {
  start: Sparkle,
  history: Clock,
  bookmarks: Bookmark,
  settings: Cog,
} as const;

/**
 * The tab row. The first 72px stay empty: the window's controls float there.
 * Tabs are a tablist — one tab stop, arrows move between them — and each
 * carries its own close button so the mouse and the keyboard agree.
 */
export function TabStrip({ tabs, activeId, onSelect, onClose, onNew }: TabStripProps) {
  const strip = useRef<HTMLDivElement>(null);

  // Keep the active tab in view when the strip is crowded enough to scroll.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the selected tab is read from the DOM, so activeId is the trigger
  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>, index: number) => {
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
      const tab = tabs[index];
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
    </div>
  );
}
