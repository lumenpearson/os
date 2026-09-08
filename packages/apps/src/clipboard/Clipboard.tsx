/**
 * Clipboard: the history the kernel has been keeping, on screen at last.
 *
 * The kernel's store is the source. Nothing is copied out of it into this
 * app's own state — the list is derived from the ring on every render, so a
 * copy made in another window turns up here without this one being told.
 * What the app does keep is its own file: the pins, and a note of which items
 * have been taken out of the list. The kernel's store has no remove and no
 * unpin, so both live here, and the detail pane says which record a pinned
 * item is: the system's, this app's, or both.
 *
 * A click on a row is the whole point of the app, so it does the thing —
 * puts that item back on the clipboard — rather than merely selecting it.
 */

import { useClipboardStore } from '@lumen/kernel';
import { useClock, useKernel } from '@lumen/kernel/react';
import {
  AppFrame,
  cx,
  EmptyState,
  IconButton,
  SearchField,
  Toolbar,
  useDialogs,
  useElementSize,
  useLatest,
} from '@lumen/ui';
import { join } from '@lumen/vfs';
import { ClipboardList, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type AppProps, useAppMenus, useJsonFile, useTitle, useWindowControls } from '../_sdk';
import { EntryDetail } from './EntryDetail';
import { EntryList } from './EntryList';
import {
  type ClipEntry,
  clipKey,
  contentOfItem,
  emptyMessage,
  listSummary,
  searchEntries,
  visibleEntries,
} from './entry';
import { layoutFor } from './layout';
import { buildClipboardMenus } from './menus';
import {
  type ClipboardData,
  clearHistory,
  DEFAULT_DATA,
  normalizeData,
  pinEntry,
  removeEntry,
  unpinEntry,
} from './storage';

/** How long the status line reports what a command did. */
const STATUS_MS = 1600;

/** Relative times are minutes-coarse, so this is often enough to keep them true. */
const CLOCK_MS = 30_000;

export default function Clipboard(_props: AppProps) {
  const kernel = useKernel();
  const dialogs = useDialogs();
  const { close, window: frameWindow } = useWindowControls();
  const [frame, size] = useElementSize<HTMLDivElement>();
  const now = useClock(CLOCK_MS).getTime();

  const history = useClipboardStore((s) => s.history);
  const currentItem = useClipboardStore((s) => s.item);
  const copyText = useClipboardStore((s) => s.copyText);
  const copyFiles = useClipboardStore((s) => s.copyFiles);

  const [stored, store] = useJsonFile<ClipboardData>(
    join(kernel.home, '.config', 'clipboard.json'),
    DEFAULT_DATA,
  );
  const data = useMemo(() => normalizeData(stored), [stored]);

  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (statusTimer.current) clearTimeout(statusTimer.current);
    },
    [],
  );

  useTitle('Clipboard');

  /**
   * The measured content box decides the layout. Until the observer has run
   * once it reads zero, and an unmeasured window is not a small window, so
   * the size the shell opened it at stands in for that one frame.
   */
  const measured = size.width > 0 ? size : (frameWindow?.bounds ?? size);
  const layout = layoutFor(measured);

  const groups = useMemo(() => visibleEntries(history, data), [history, data]);
  const pinned = useMemo(() => searchEntries(groups.pinned, query), [groups.pinned, query]);
  const recent = useMemo(() => searchEntries(groups.recent, query), [groups.recent, query]);
  const order = useMemo(() => [...pinned, ...recent], [pinned, recent]);
  /** A selection that has been removed or filtered away falls back to the top. */
  const selected = order.find((entry) => entry.key === selectedKey) ?? order[0] ?? null;
  const currentKey = useMemo(() => {
    const content = currentItem ? contentOfItem(currentItem) : null;
    return content ? clipKey(content) : null;
  }, [currentItem]);

  // ── commands ────────────────────────────────────────────────────────────

  const say = useCallback((message: string) => {
    setStatus(message);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(''), STATUS_MS);
  }, []);

  const update = useCallback(
    (change: (previous: ClipboardData) => ClipboardData) => {
      store((previous) => change(normalizeData(previous)));
    },
    [store],
  );

  const putBack = useCallback(
    (entry: ClipEntry) => {
      if (entry.kind === 'files' && entry.files) {
        copyFiles(entry.files.paths, entry.files.operation);
      } else {
        copyText(entry.text);
      }
      setSelectedKey(entry.key);
      say('Put back on the clipboard');
    },
    [copyText, copyFiles, say],
  );

  const togglePin = useCallback(
    (entry: ClipEntry) => {
      update((previous) =>
        entry.pinned ? unpinEntry(previous, entry.key) : pinEntry(previous, entry, Date.now()),
      );
      setSelectedKey(entry.key);
      say(entry.pinned ? 'Unpinned' : 'Pinned');
    },
    [update, say],
  );

  const remove = useCallback(
    (entry: ClipEntry) => {
      // Removing the selected row should leave the selection next to where it
      // was, not back at the top of the list.
      const at = order.findIndex((other) => other.key === entry.key);
      const next = order[at + 1] ?? order[at - 1] ?? null;
      update((previous) => removeEntry(previous, entry));
      setSelectedKey(next?.key ?? null);
      say('Removed');
    },
    [order, update, say],
  );

  const clearAll = useCallback(async () => {
    const pins = groups.pinned.length;
    const kept =
      pins === 0
        ? ''
        : pins === 1
          ? ' The pinned item is kept.'
          : ` The ${pins} pinned items are kept.`;
    const ok = await dialogs.confirm({
      title: 'Clear the clipboard history?',
      message: `Clipboard stops showing the items in the list.${kept}`,
      confirmLabel: 'Clear All',
      danger: true,
    });
    if (!ok) return;
    update((previous) => clearHistory(previous, Date.now()));
    setSelectedKey(null);
    say('History cleared');
  }, [groups.pinned.length, dialogs, update, say]);

  const find = useCallback(() => {
    searchInput.current?.focus();
    searchInput.current?.select();
  }, []);

  const commands = useLatest({ close, putBack, togglePin, remove, clearAll, find, selected });
  const hasHistory = groups.recent.length > 0;

  useAppMenus(
    buildClipboardMenus(
      {
        hasSelection: selected !== null,
        isPinned: selected?.pinned ?? false,
        hasItems: hasHistory,
      },
      {
        close: () => commands.current.close(),
        putBack: () => {
          const entry = commands.current.selected;
          if (entry) commands.current.putBack(entry);
        },
        togglePin: () => {
          const entry = commands.current.selected;
          if (entry) commands.current.togglePin(entry);
        },
        remove: () => {
          const entry = commands.current.selected;
          if (entry) commands.current.remove(entry);
        },
        clearAll: () => void commands.current.clearAll(),
        find: () => commands.current.find(),
      },
    ),
    [selected !== null, selected?.pinned, hasHistory],
  );

  // ── the window ──────────────────────────────────────────────────────────

  const searching = query.trim() !== '';
  const message = emptyMessage({
    searching,
    nothingCopied: history.length === 0 && groups.pinned.length === 0,
  });

  return (
    <div ref={frame} className="flex h-full min-h-0 w-full">
      <AppFrame
        toolbar={
          <Toolbar dense windowControls>
            {/* The window has no title bar of its own, so this row names it. */}
            <span className="truncate-1 mr-1 min-w-0 text-base font-medium text-ink">
              Clipboard
            </span>
            <div className="ml-auto min-w-0 max-w-64 flex-1">
              <SearchField
                ref={searchInput}
                size="sm"
                placeholder="Search"
                aria-label="Search clipboard items"
                value={query}
                onChange={setQuery}
              />
            </div>
            <IconButton
              size="sm"
              label="Clear All"
              disabled={!hasHistory}
              onClick={() => void commands.current.clearAll()}
            >
              <Trash2 />
            </IconButton>
          </Toolbar>
        }
        statusBar={
          <>
            <span className="tabular-nums">
              {listSummary({
                shown: order.length,
                total: groups.pinned.length + groups.recent.length,
                pinned: groups.pinned.length,
              })}
            </span>
            <span role="status" aria-live="polite" className="truncate-1 ml-auto text-ink-3">
              {status}
            </span>
          </>
        }
      >
        <div className={cx('flex min-h-0 min-w-0 flex-1', layout.split ? 'flex-row' : 'flex-col')}>
          {selected === null ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <EmptyState
                icon={<ClipboardList className="size-5" />}
                title={message.title}
                description={message.description}
              />
            </div>
          ) : (
            <>
              <div
                className={cx(
                  'flex min-h-0 min-w-0 flex-col',
                  layout.split ? 'shrink-0 border-r border-rule' : 'flex-1 border-b border-rule',
                )}
                style={layout.split ? { width: layout.listWidth } : undefined}
              >
                <EntryList
                  pinned={pinned}
                  recent={recent}
                  selectedKey={selected.key}
                  currentKey={currentKey}
                  now={now}
                  onSelect={setSelectedKey}
                  onPutBack={putBack}
                  onRemove={remove}
                />
              </div>
              <div
                className={cx(
                  'flex min-h-0 min-w-0 flex-col',
                  layout.split ? 'flex-1' : 'shrink-0',
                )}
                style={layout.split ? undefined : { height: layout.detailHeight }}
              >
                <EntryDetail
                  entry={selected}
                  now={now}
                  onPutBack={putBack}
                  onTogglePin={togglePin}
                  onRemove={remove}
                />
              </div>
            </>
          )}
        </div>
      </AppFrame>
    </div>
  );
}
