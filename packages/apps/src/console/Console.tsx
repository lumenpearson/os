/**
 * Console: what the running system actually did.
 *
 * The capture subscribes to the kernel's own event bus, to the notification
 * store, to uncaught errors and rejections, and — only while this window is
 * open — to `console.*`. Records land in a fixed-capacity ring buffer, so a
 * long session costs a bounded amount of memory and the oldest lines fall off
 * the back rather than the window growing without limit.
 *
 * Filtering never mutates the buffer: the level, source and search filters
 * compile to one predicate applied on the way out, so turning a filter off
 * brings the hidden lines straight back.
 */

import { useClipboardStore } from '@lumen/kernel';
import { useKernel, useVfs } from '@lumen/kernel/react';
import {
  AppFrame,
  Button,
  cx,
  EmptyState,
  IconButton,
  SearchField,
  Toolbar,
  ToolbarSpacer,
  useElementSize,
  useLatest,
} from '@lumen/ui';
import { join } from '@lumen/vfs';
import { ArrowDownToLine, Download, Pause, Play, ScrollText, Trash2 } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  useAppMenus,
  useJsonFile,
  useNotify,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { DEFAULT_CONFIG, normalizeConfig, toggleLevel } from './config';
import { collectSources, compileFilter, type FilterState } from './filter';
import { serializeRecord } from './format';
import { LogList } from './LogList';
import { buildConsoleMenus } from './menus';
import { LEVELS, type LogLevel } from './types';
import { useCapture } from './useCapture';

/**
 * Roughly a long working session's worth of events. Large enough that the
 * interesting line is still there when someone thinks to open the window,
 * small enough to stay well inside a tab's memory.
 */
const CAPACITY = 5000;

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: 'Debug',
  info: 'Info',
  warn: 'Warn',
  error: 'Error',
};

/** Below this the source filter drops out; the search box is worth more. */
const SOURCES_AT = 700;

export default function Console(_props: AppProps) {
  const kernel = useKernel();
  const vfs = useVfs();
  const notify = useNotify();
  const { close } = useWindowControls();
  const capture = useCapture(CAPACITY);

  const [config, setConfig] = useJsonFile(
    join(kernel.home, '.config', 'console.json'),
    DEFAULT_CONFIG,
  );
  const levels = useMemo(() => normalizeConfig(config).levels, [config]);

  const [sources, setSources] = useState<ReadonlySet<string> | null>(null);
  const [search, setSearch] = useState('');
  const [follow, setFollow] = useState(true);
  const [expanded, setExpanded] = useState<ReadonlySet<number>>(() => new Set());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // The toolbar measures itself: a window is not the viewport, so a media
  // query would answer the wrong question.
  const [toolbarRef, { width }] = useElementSize<HTMLDivElement>();

  // `version` bumps once a frame while records arrive; reading the buffer is
  // keyed on it so the list re-renders at most once per frame no matter how
  // many events a burst carries.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the version is the signal that the buffer changed
  const all = useMemo(() => capture.buffer.toArray(), [capture.buffer, capture.version]);

  const filterState: FilterState = useMemo(
    () => ({ levels: new Set(levels), sources, search }),
    [levels, sources, search],
  );
  const { predicate, query, error } = useMemo(() => compileFilter(filterState), [filterState]);
  const rows = useMemo(() => all.filter(predicate), [all, predicate]);
  const knownSources = useMemo(() => collectSources(all), [all]);

  useTitle(capture.paused ? 'Console — paused' : 'Console');

  const toggleExpanded = useCallback((id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const clear = useCallback(() => {
    capture.clear();
    setExpanded(new Set());
    setSelectedId(null);
  }, [capture]);

  const exportLog = useCallback(async () => {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const path = join(kernel.home, 'Documents', `console-${stamp}.log`);
    // What is written is what is on screen: the filter is part of the export,
    // because a log of everything is what the buffer already is.
    const body = rows.map((record) => serializeRecord(record)).join('\n');
    await vfs.writeText(path, `${body}\n`, { recursive: true });
    notify('Log exported', path);
  }, [kernel.home, notify, rows, vfs]);

  const copySelected = useCallback(() => {
    const record = rows.find((r) => r.id === selectedId);
    if (!record) return;
    // The OS clipboard, which mirrors to the host where the browser allows it.
    useClipboardStore.getState().copyText(serializeRecord(record));
  }, [rows, selectedId]);

  const latest = useLatest({
    exportLog,
    clear,
    copySelected,
    toggleFollow: () => setFollow((f) => !f),
    toggleLevel: (level: LogLevel) =>
      setConfig((c) => ({ ...c, levels: toggleLevel(c.levels, level) })),
    togglePaused: () => capture.setPaused(!capture.paused),
    find: () => searchRef.current?.focus(),
  });

  useAppMenus(
    buildConsoleMenus(
      {
        levels,
        follow,
        paused: capture.paused,
        rowCount: rows.length,
        hasSelection: selectedId !== null,
      },
      {
        exportLog: () => void latest.current.exportLog(),
        clear: () => latest.current.clear(),
        toggleFollow: () => latest.current.toggleFollow(),
        toggleLevel: (level) => latest.current.toggleLevel(level),
        togglePaused: () => latest.current.togglePaused(),
        find: () => latest.current.find(),
        copySelected: () => latest.current.copySelected(),
      },
    ),
    [levels, follow, capture.paused, rows.length, selectedId, close],
  );

  const showSources = width === 0 || width >= SOURCES_AT;
  const empty =
    all.length === 0
      ? {
          title: capture.paused ? 'Capture is paused' : 'Nothing has happened yet',
          description: capture.paused
            ? 'Resume to start recording again. Events that arrive while paused are counted, not kept.'
            : 'Launch an app or change a setting and it will appear here.',
        }
      : {
          title: 'Nothing matches',
          description: 'Widen the levels, clear the source filter, or change the search.',
        };

  return (
    <AppFrame
      toolbar={
        <Toolbar dense>
          <div ref={toolbarRef} className="flex min-w-0 flex-1 items-center gap-1.5">
            <div className="flex shrink-0 items-center gap-0.5" role="group" aria-label="Levels">
              {LEVELS.map((level) => (
                <Button
                  key={level}
                  size="sm"
                  variant={levels.includes(level) ? 'secondary' : 'ghost'}
                  aria-pressed={levels.includes(level)}
                  onClick={() => setConfig((c) => ({ ...c, levels: toggleLevel(c.levels, level) }))}
                  className={levels.includes(level) ? undefined : 'text-ink-3'}
                >
                  {LEVEL_LABEL[level]}
                </Button>
              ))}
            </div>

            {showSources && knownSources.length > 1 && (
              <select
                aria-label="Source"
                className="h-6 rounded-xs border border-rule bg-surface px-1.5 text-sm text-ink lumen-focus"
                value={sources === null ? '' : ([...sources][0] ?? '')}
                onChange={(e) =>
                  setSources(e.target.value === '' ? null : new Set([e.target.value]))
                }
              >
                <option value="">All sources</option>
                {knownSources.map((source) => (
                  <option key={source} value={source}>
                    {source}
                  </option>
                ))}
              </select>
            )}

            <SearchField
              ref={searchRef}
              size="sm"
              // The four level buttons and the icons keep their size; the
              // search field is the one control here that can give up width.
              className="min-w-16 max-w-56"
              placeholder="Search, or /regex/"
              aria-label="Search log"
              value={search}
              onChange={setSearch}
            />

            <ToolbarSpacer />

            <IconButton
              size="sm"
              label={follow ? 'Stop following the tail' : 'Follow the tail'}
              aria-pressed={follow}
              onClick={() => setFollow((f) => !f)}
            >
              <ArrowDownToLine className={cx('size-3.5', follow ? undefined : 'text-ink-3')} />
            </IconButton>
            <IconButton
              size="sm"
              label={capture.paused ? 'Resume capture' : 'Pause capture'}
              aria-pressed={capture.paused}
              onClick={() => capture.setPaused(!capture.paused)}
            >
              {capture.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            </IconButton>
            <IconButton size="sm" label="Export log" onClick={() => void exportLog()}>
              <Download className="size-3.5" />
            </IconButton>
            <IconButton size="sm" label="Clear" onClick={clear}>
              <Trash2 className="size-3.5" />
            </IconButton>
          </div>
        </Toolbar>
      }
      statusBar={
        <>
          <span className="mono tabular-nums">
            {rows.length === all.length
              ? `${all.length} records`
              : `${rows.length} of ${all.length} records`}
          </span>
          {capture.paused && capture.skipped > 0 && (
            <span className="mono tabular-nums text-ink-3">{capture.skipped} skipped</span>
          )}
          {error && <span className="text-danger">{error}</span>}
        </>
      }
    >
      {rows.length === 0 ? (
        <EmptyState icon={<ScrollText className="size-5" />} {...empty} />
      ) : (
        <LogList
          rows={rows}
          query={query}
          expanded={expanded}
          onToggleExpanded={toggleExpanded}
          selectedId={selectedId}
          onSelect={setSelectedId}
          follow={follow}
          onFollowChange={setFollow}
          emptyTitle={empty.title}
          emptyDescription={empty.description}
        />
      )}
    </AppFrame>
  );
}
