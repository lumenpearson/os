/**
 * Archive Utility: one ZIP file at a time.
 *
 * The window holds the archive's bytes and the entry list parsed out of them.
 * Everything that touches disk — opening, extracting, building — runs as one
 * job at a time behind `run()`, which owns the busy flag, the progress line
 * and the error line, and yields between entries so a large archive never
 * freezes the window.
 */

import { useKernel, useVfs } from '@lumen/kernel/react';
import {
  Button,
  cx,
  Progress,
  SearchField,
  Toolbar,
  ToolbarSpacer,
  useElementSize,
  useLatest,
} from '@lumen/ui';
import { basename, join } from '@lumen/vfs';
import { FileArchive, FolderDown, FolderInput, FolderOpen, Package } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  useApp,
  useAppMenus,
  useArgs,
  useFilePicker,
  useJsonFile,
  useNotify,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { DetailsPanel } from './DetailsPanel';
import { EntryTable } from './EntryTable';
import { type ArchiveTotals, summarize, totalsOf } from './format';
import { layoutFor } from './layout';
import { buildArchiveMenus } from './menus';
import { NewArchiveDialog } from './NewArchiveDialog';
import { describeExtraction, planExtraction } from './operations';
import { type PackSource, packArchive, readEntryData } from './pack';
import { type ArchivePrefs, DEFAULT_PREFS, normalizePrefs } from './prefs';
import { entryNameFor, planRoots, suggestArchiveName } from './sources';
import {
  buildTree,
  folderIds,
  initialExpanded,
  nodeIndex,
  type SortColumn,
  selectedEntries,
  visibleRows,
} from './tree';
import { readZip, type ZipArchive } from './zip';

interface OpenArchive {
  path: string;
  bytes: Uint8Array;
  archive: ZipArchive;
}

interface Job {
  label: string;
  /** 0–1, or null while the length of the work is unknown. */
  value: number | null;
}

const EMPTY = new Uint8Array(0);

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export default function Archive(props: AppProps) {
  const kernel = useKernel();
  const vfs = useVfs();
  const notify = useNotify();
  const pick = useFilePicker();
  const { container } = useApp();
  const { close, focused, setDocument } = useWindowControls();
  const args = useArgs<{ path?: string }>(props.args);
  const [frame, { width }] = useElementSize<HTMLDivElement>();

  const [stored, store] = useJsonFile<ArchivePrefs>(
    join(kernel.home, '.config', 'archive.json'),
    DEFAULT_PREFS,
  );
  const prefs = useMemo(() => normalizePrefs(stored), [stored]);

  const [doc, setDoc] = useState<OpenArchive | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set<string>());
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [picking, setPicking] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const running = useRef(false);

  const tree = useMemo(() => buildTree(doc?.archive.entries ?? []), [doc]);
  const index = useMemo(() => nodeIndex(tree), [tree]);
  const rows = useMemo(
    () => visibleRows(tree, { expanded, sort: prefs.sort, query }),
    [tree, expanded, prefs.sort, query],
  );
  const totals = useMemo(() => totalsOf(doc?.archive.entries ?? []), [doc]);
  const layout = layoutFor(width, { showDetails: prefs.showDetails });

  const current = cursor === null ? null : (index.get(cursor) ?? null);
  const currentEntry =
    current && current.entry >= 0 ? (doc?.archive.entries[current.entry] ?? null) : null;

  useTitle(doc?.path ? basename(doc.path) : 'Archive Utility');
  useEffect(() => {
    setDocument(doc?.path ?? null);
  }, [doc?.path, setDocument]);

  const setPrefs = useCallback(
    (patch: Partial<ArchivePrefs>) => {
      store((previous) => ({ ...normalizePrefs(previous), ...patch }));
    },
    [store],
  );

  /**
   * One job at a time: a second Extract while the first is still writing
   * would interleave two sets of writes over the same folder.
   */
  const run = useCallback(
    async (label: string, work: (report: (job: Job) => void) => Promise<void>) => {
      if (running.current) return;
      running.current = true;
      setError(null);
      setJob({ label, value: null });
      try {
        await work(setJob);
      } catch (failure) {
        setError(message(failure));
      } finally {
        running.current = false;
        setJob(null);
      }
    },
    [],
  );

  const openPath = useCallback(
    (path: string) =>
      run(`Reading ${basename(path)}`, async () => {
        const bytes = await vfs.readFile(path);
        const archive = readZip(bytes);
        setDoc({ path, bytes, archive });
        setExpanded(initialExpanded(buildTree(archive.entries), archive.entries.length));
        setSelected(new Set());
        setCursor(null);
        setQuery('');
        kernel.addRecent(path, 'lumen.archive');
      }),
    [run, vfs, kernel],
  );

  // A launch argument, and any later one sent to the same window.
  const latestOpen = useLatest(openPath);
  useEffect(() => {
    if (args.path) void latestOpen.current(args.path);
  }, [args.path, latestOpen]);

  const chooseAndOpen = useCallback(async () => {
    const path = await pick({ mode: 'open', extensions: ['.zip'], title: 'Open Archive' });
    if (typeof path === 'string') void openPath(path);
  }, [pick, openPath]);

  const extract = useCallback(
    async (indices: number[]) => {
      if (!doc || indices.length === 0) return;
      const destination = await pick({
        mode: 'folder',
        title: 'Extract To',
        confirmLabel: 'Extract',
      });
      if (typeof destination !== 'string') return;

      await run('Extracting', async (report) => {
        const plan = planExtraction(doc.archive.entries, indices, destination);
        let written = 0;
        let failed = 0;
        let firstFailure: string | null = null;

        for (const [step, write] of plan.writes.entries()) {
          report({
            label: `Extracting ${basename(write.target)}`,
            value: plan.writes.length === 0 ? null : step / plan.writes.length,
          });
          try {
            if (write.entry.isDirectory) {
              await vfs.ensureDir(write.target);
            } else {
              const data = await readEntryData(doc.bytes, write.entry);
              await vfs.writeFile(write.target, data, { recursive: true });
            }
            written += 1;
          } catch (failure) {
            failed += 1;
            firstFailure ??= message(failure);
          }
        }

        const report_ = describeExtraction({
          written,
          refused: plan.refused.length,
          failed,
          firstFailure,
          destination,
        });
        notify('Extraction finished', report_);
        if (failed > 0 || plan.refused.length > 0) setError(report_);
      });
    },
    [doc, pick, run, vfs, notify],
  );

  const create = useCallback(
    async (paths: string[]) => {
      const roots = planRoots(paths);
      if (roots.length === 0) return;
      const target = await pick({
        mode: 'save',
        title: 'New Archive',
        defaultName: suggestArchiveName(roots),
      });
      if (typeof target !== 'string') return;

      await run('Collecting files', async (report) => {
        const sources: PackSource[] = [];
        for (const root of roots) {
          const stat = await vfs.stat(root.path);
          if (stat.kind === 'file') {
            sources.push({
              name: root.name,
              isDirectory: false,
              data: await vfs.readFile(root.path),
              modifiedAt: stat.modifiedAt,
            });
            continue;
          }
          sources.push({
            name: root.name,
            isDirectory: true,
            data: EMPTY,
            modifiedAt: stat.modifiedAt,
          });
          await vfs.walk(root.path, async (entry) => {
            report({ label: `Reading ${entry.name}`, value: null });
            sources.push({
              name: entryNameFor(root, entry.path),
              isDirectory: entry.kind === 'directory',
              data: entry.kind === 'directory' ? EMPTY : await vfs.readFile(entry.path),
              modifiedAt: entry.modifiedAt,
            });
            return true;
          });
        }

        const bytes = await packArchive(sources, {
          onProgress: ({ done, total, name }) =>
            report({
              label: name === '' ? 'Writing archive' : `Compressing ${basename(name)}`,
              value: total === 0 ? null : done / total,
            }),
        });
        await vfs.writeFile(target, bytes, { recursive: true });
        notify('Archive created', `${basename(target)} · ${sources.length} entries`);
      });
      void openPath(target);
    },
    [pick, run, vfs, notify, openPath],
  );

  const toggle = useCallback((id: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedIndices = useMemo(() => selectedEntries(tree, selected), [tree, selected]);
  const allIndices = useMemo(() => (doc ? doc.archive.entries.map((_, i) => i) : []), [doc]);

  const latest = useLatest({
    open: chooseAndOpen,
    newArchive: () => setPicking(true),
    extractAll: () => void extract(allIndices),
    extractSelected: () => void extract(selectedIndices),
    close,
    find: () => searchRef.current?.focus(),
    setSort: (column: SortColumn) =>
      setPrefs({ sort: { column, direction: prefs.sort.direction } }),
    setDirection: (direction: 'asc' | 'desc') =>
      setPrefs({ sort: { column: prefs.sort.column, direction } }),
    toggleExactBytes: () => setPrefs({ exactBytes: !prefs.exactBytes }),
    toggleDetails: () => setPrefs({ showDetails: !prefs.showDetails }),
    expandAll: () => setExpanded(new Set(folderIds(tree))),
    collapseAll: () => setExpanded(new Set<string>()),
  });

  useAppMenus(
    buildArchiveMenus(
      {
        hasArchive: doc !== null,
        hasSelection: selectedIndices.length > 0,
        busy: job !== null,
        sort: prefs.sort,
        exactBytes: prefs.exactBytes,
        showDetails: prefs.showDetails,
      },
      {
        open: () => latest.current.open(),
        newArchive: () => latest.current.newArchive(),
        extractAll: () => latest.current.extractAll(),
        extractSelected: () => latest.current.extractSelected(),
        close: () => latest.current.close(),
        find: () => latest.current.find(),
        setSort: (column) => latest.current.setSort(column),
        setDirection: (direction) => latest.current.setDirection(direction),
        toggleExactBytes: () => latest.current.toggleExactBytes(),
        toggleDetails: () => latest.current.toggleDetails(),
        expandAll: () => latest.current.expandAll(),
        collapseAll: () => latest.current.collapseAll(),
      },
    ),
    [doc !== null, selectedIndices.length, job !== null, prefs, tree, close],
  );

  const sortBy = (column: SortColumn) => {
    if (prefs.sort.column !== column) {
      setPrefs({ sort: { column, direction: 'asc' } });
      return;
    }
    setPrefs({
      sort: { column, direction: prefs.sort.direction === 'asc' ? 'desc' : 'asc' },
    });
  };

  const busy = job !== null;
  const label = (text: string) => (layout.compactToolbar ? null : text);

  return (
    <div ref={frame} className="flex h-full min-h-0 w-full flex-col bg-surface text-ink">
      <Toolbar dense>
        <Button
          size="sm"
          icon={<FolderOpen className="size-3.5" />}
          aria-label="Open"
          title="Open"
          disabled={busy}
          onClick={() => latest.current.open()}
        >
          {label('Open')}
        </Button>
        <Button
          size="sm"
          icon={<Package className="size-3.5" />}
          aria-label="New Archive"
          title="New Archive"
          disabled={busy}
          onClick={() => latest.current.newArchive()}
        >
          {label('New Archive')}
        </Button>
        <span aria-hidden className="mx-1 h-4 w-px bg-rule" />
        <Button
          size="sm"
          icon={<FolderInput className="size-3.5" />}
          aria-label="Extract All"
          title="Extract All"
          disabled={busy || !doc}
          onClick={() => latest.current.extractAll()}
        >
          {label('Extract All')}
        </Button>
        <Button
          size="sm"
          icon={<FolderDown className="size-3.5" />}
          aria-label="Extract Selected"
          title="Extract Selected"
          disabled={busy || selectedIndices.length === 0}
          onClick={() => latest.current.extractSelected()}
        >
          {label('Extract Selected')}
        </Button>
        <ToolbarSpacer />
        <SearchField
          ref={searchRef}
          value={query}
          onChange={setQuery}
          placeholder="Find"
          aria-label="Find in archive"
          disabled={!doc}
          className={cx('h-6', layout.compactToolbar ? 'w-28' : 'w-48')}
        />
      </Toolbar>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {doc ? (
            <EntryTable
              rows={rows}
              columns={layout.columns}
              minWidth={layout.minTableWidth}
              sort={prefs.sort}
              onSort={sortBy}
              selected={selected}
              onSelect={(ids, next) => {
                setSelected(ids);
                setCursor(next);
              }}
              cursor={cursor}
              onCursor={setCursor}
              onToggle={toggle}
              exactBytes={prefs.exactBytes}
              focused={focused}
              empty={query ? `Nothing matches “${query}”.` : 'This archive is empty.'}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <FileArchive aria-hidden className="size-8 stroke-[1.5] text-ink-3" />
              <p className="text-md font-medium text-ink">No archive open</p>
              <p className="max-w-72 text-base text-ink-2">
                Open a .zip file to see what is inside it, or build a new one from files and
                folders.
              </p>
              <div className="mt-1 flex gap-2">
                <Button variant="primary" onClick={() => latest.current.open()}>
                  Open…
                </Button>
                <Button onClick={() => latest.current.newArchive()}>New Archive…</Button>
              </div>
            </div>
          )}
        </div>

        {layout.showDetails && doc && (
          <DetailsPanel
            width={layout.detailsWidth}
            path={doc.path}
            fileSize={doc.archive.size}
            totals={totals}
            comment={doc.archive.comment}
            node={current}
            entry={currentEntry}
            exactBytes={prefs.exactBytes}
          />
        )}
      </div>

      <div className="flex h-7 shrink-0 items-center gap-3 border-t border-rule bg-canvas px-3">
        {job ? (
          <>
            <span className="truncate-1 text-sm text-ink-2">{job.label}</span>
            <Progress
              value={job.value ?? undefined}
              label={job.label}
              className="ml-auto w-32 shrink-0"
            />
          </>
        ) : (
          <>
            <span className="mono truncate-1 text-sm text-ink-2 tabular-nums">
              {doc ? summaryFor(totals, prefs.exactBytes, rows.length, query) : ''}
            </span>
            {error && (
              <span role="status" className="truncate-1 ml-auto text-sm text-danger">
                {error}
              </span>
            )}
          </>
        )}
      </div>

      {picking && (
        <NewArchiveDialog
          container={container}
          onCancel={() => setPicking(false)}
          onCreate={(paths) => {
            setPicking(false);
            void create(paths);
          }}
        />
      )}
    </div>
  );
}

/** The status line: what the archive holds, narrowed to the search when there is one. */
function summaryFor(
  totals: ArchiveTotals,
  exactBytes: boolean,
  shown: number,
  query: string,
): string {
  const base = summarize(totals, exactBytes);
  return query.trim() === '' ? base : `${shown} matching · ${base}`;
}
