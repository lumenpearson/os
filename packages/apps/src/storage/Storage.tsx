/**
 * Storage: where the space went.
 *
 * One scan feeds all three views. It walks the home folder in batches,
 * yielding to the event loop between them so the window keeps painting,
 * reports what it has counted, and can be stopped at any point. A folder the
 * sandbox refuses is counted as an error and the walk carries on. The last
 * finished result is kept under the home folder with the time it was taken,
 * so opening the window shows figures immediately and says how old they are.
 */

import { useKernel, useVfs } from '@lumen/kernel/react';
import {
  AppFrame,
  Button,
  EmptyState,
  IconButton,
  SegmentedControl,
  Toolbar,
  ToolbarSpacer,
  useDialogs,
  useLatest,
} from '@lumen/ui';
import { basename, dirname, formatBytes, isInside, join } from '@lumen/vfs';
import { ChartPie, FolderTree, HardDrive, RotateCw, Table, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AppProps,
  formatRelative,
  useAppMenus,
  useJsonFile,
  useLauncher,
  useNotify,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { fromCacheRecord, toCacheRecord } from './cache';
import { categoryTotals } from './categories';
import { Folders } from './Folders';
import { LargestFiles } from './LargestFiles';
import { readTrash, readUsageSources, type TrashReading } from './measure';
import { buildStorageMenus, type StorageView } from './menus';
import { Overview } from './Overview';
import { progressLabel, type ScanProgress, type ScanResult, scan } from './scan';
import { buildTree, findNode, largestFiles } from './tree';
import { buildSegments, buildUsageReport, coverageNote, type UsageSources } from './usage';

/** Rows the largest-files table holds. Beyond this the list stops being a list. */
const LARGEST_LIMIT = 200;
/** Progress redraws no more often than this. */
const PROGRESS_MS = 120;

export default function Storage(_props: AppProps) {
  const vfs = useVfs();
  const kernel = useKernel();
  const notify = useNotify();
  const dialogs = useDialogs();
  const { launch } = useLauncher();
  const { close } = useWindowControls();
  useTitle('Storage');

  const root = kernel.home;
  const cachePath = useMemo(() => join(root, '.config', 'storage.json'), [root]);
  const [cached, setCached, cacheState] = useJsonFile<unknown>(cachePath, null);

  const [view, setView] = useState<StorageView>('overview');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [scanning, setScanning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [sources, setSources] = useState<UsageSources | null>(null);
  const [trash, setTrash] = useState<TrashReading | null>(null);
  const [folderPath, setFolderPath] = useState(root);
  const [working, setWorking] = useState(false);
  const running = useRef<AbortController | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      running.current?.abort();
    };
  }, []);

  const measure = useCallback(async () => {
    const [usage, trashReading] = await Promise.all([
      readUsageSources(vfs),
      readTrash(vfs).catch(() => null),
    ]);
    if (!alive.current) return;
    setSources(usage);
    if (trashReading) setTrash(trashReading);
  }, [vfs]);

  const rescan = useCallback(async () => {
    running.current?.abort();
    const controller = new AbortController();
    running.current = controller;
    setScanning(true);
    setFailure(null);
    setProgress(null);
    let painted = 0;
    try {
      const walk = scan(vfs, root, {
        signal: controller.signal,
        onProgress: (next) => {
          const now = Date.now();
          if (now - painted < PROGRESS_MS) return;
          painted = now;
          if (alive.current) setProgress(next);
        },
      });
      const [next] = await Promise.all([walk, measure()]);
      if (!alive.current) return;
      setResult(next);
      const record = toCacheRecord(next);
      if (record) setCached(record);
    } catch (error) {
      if (alive.current) setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      if (running.current === controller) running.current = null;
      if (alive.current) {
        setScanning(false);
        setProgress(null);
      }
    }
  }, [vfs, root, measure, setCached]);

  // The first run reads the cache instead of walking the tree; only a cache
  // that is missing, stale in shape, or for another folder starts a scan.
  const started = useRef(false);
  const latestStart = useLatest({ cached, rescan, measure });
  useEffect(() => {
    if (!cacheState.loaded || started.current) return;
    started.current = true;
    const previous = fromCacheRecord(latestStart.current.cached, root);
    if (previous) {
      setResult(previous);
      void latestStart.current.measure();
    } else {
      void latestStart.current.rescan();
    }
  }, [cacheState.loaded, root, latestStart]);

  const cancelScan = useCallback(() => running.current?.abort(), []);

  // 'Home' is what Files calls this folder in its breadcrumbs; the treemap
  // should not be the one place in the OS that shows the account name.
  const tree = useMemo(
    () => (result ? buildTree(root, result.files, 'Home') : null),
    [result, root],
  );
  const totals = useMemo(() => categoryTotals(result?.files ?? []), [result]);
  const segments = useMemo(() => buildSegments(totals, trash?.total ?? null), [totals, trash]);
  const report = useMemo(() => (sources ? buildUsageReport(sources) : null), [sources]);
  const segmented = useMemo(
    () => ({
      bytes: segments.reduce((sum, segment) => sum + segment.bytes, 0),
      files: segments.reduce((sum, segment) => sum + segment.files, 0),
    }),
    [segments],
  );
  const largest = useMemo(() => largestFiles(result?.files ?? [], LARGEST_LIMIT), [result]);
  const activePath = tree && findNode(tree, folderPath) ? folderPath : root;
  const trashBytes = trash?.total?.bytes ?? null;

  const emptyTrash = useCallback(async () => {
    const bytes = trash?.total?.bytes ?? 0;
    const confirmed = await dialogs.confirm({
      title: 'Empty the Trash?',
      message: `${formatBytes(bytes)} in ${trash?.total?.files ?? 0} files will be deleted. This cannot be undone.`,
      confirmLabel: 'Empty Trash',
      danger: true,
    });
    if (!confirmed) return;
    setWorking(true);
    try {
      await vfs.emptyTrash();
      await measure();
      notify('Trash emptied', `${formatBytes(bytes)} freed.`);
    } catch (error) {
      notify('Could not empty the Trash', error instanceof Error ? error.message : String(error));
    } finally {
      if (alive.current) setWorking(false);
    }
  }, [vfs, dialogs, notify, measure, trash]);

  const reveal = useCallback(
    (path: string) => {
      launch('lumen.files', { path });
    },
    [launch],
  );

  const trashFiles = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return;
      setWorking(true);
      const moved: string[] = [];
      const failed: string[] = [];
      for (const path of paths) {
        try {
          await vfs.trash(path);
          moved.push(path);
        } catch {
          failed.push(path);
        }
      }
      if (moved.length > 0) {
        const gone = new Set(moved);
        setResult((current) => {
          if (!current) return current;
          const files = current.files.filter((file) => !gone.has(file.path));
          const bytes = files.reduce((sum, file) => sum + file.size, 0);
          const next = { ...current, files, bytes };
          const record = toCacheRecord(next);
          if (record) setCached(record);
          return next;
        });
        await measure();
        notify(
          moved.length === 1 ? 'Moved to Trash' : `${moved.length} files moved to Trash`,
          moved.length === 1 ? basename(moved[0] as string) : undefined,
        );
      }
      if (failed.length > 0) {
        notify('Some files could not be moved', `${failed.length} of ${paths.length} stayed put.`);
      }
      if (alive.current) setWorking(false);
    },
    [vfs, notify, measure, setCached],
  );

  const goUp = useCallback(() => {
    if (activePath === root || !isInside(root, activePath)) return;
    setFolderPath(dirname(activePath));
  }, [activePath, root]);

  const showView = useCallback((next: StorageView) => setView(next), []);

  useAppMenus(
    buildStorageMenus(
      { view, scanning, trashBytes, canGoUp: activePath !== root },
      {
        rescan: () => void rescan(),
        cancelScan,
        emptyTrash: () => void emptyTrash(),
        showView,
        goUp,
        close,
      },
    ),
    [
      view,
      scanning,
      trashBytes,
      activePath,
      root,
      rescan,
      cancelScan,
      emptyTrash,
      showView,
      goUp,
      close,
    ],
  );

  return (
    <AppFrame
      toolbar={
        <Toolbar dense>
          <SegmentedControl
            aria-label="View"
            size="sm"
            value={view}
            onChange={showView}
            options={[
              { value: 'overview', label: 'Overview', icon: <ChartPie /> },
              { value: 'folders', label: 'By Folder', icon: <FolderTree /> },
              { value: 'files', label: 'Largest Files', icon: <Table /> },
            ]}
          />
          <ToolbarSpacer />
          {scanning ? (
            <IconButton label="Cancel scan" onClick={cancelScan}>
              <X />
            </IconButton>
          ) : (
            <IconButton label="Rescan" onClick={() => void rescan()}>
              <RotateCw />
            </IconButton>
          )}
        </Toolbar>
      }
      statusBar={
        <StatusBar
          scanning={scanning}
          progress={progress}
          result={result}
          failure={failure}
          root={root}
        />
      }
    >
      <Body
        view={view}
        result={result}
        tree={tree}
        activePath={activePath}
        onPathChange={setFolderPath}
        report={report}
        segments={segments}
        segmented={segmented}
        coverage={coverageNote(segmented.bytes, sources?.adapter ?? null, root)}
        trashReason={trash?.reason}
        root={root}
        scanning={scanning}
        failure={failure}
        working={working}
        largest={largest}
        onRescan={() => void rescan()}
        onEmptyTrash={() => void emptyTrash()}
        onReveal={reveal}
        onTrash={(paths) => void trashFiles(paths)}
      />
    </AppFrame>
  );
}

interface BodyProps {
  view: StorageView;
  result: ScanResult | null;
  tree: ReturnType<typeof buildTree> | null;
  activePath: string;
  onPathChange: (path: string) => void;
  report: ReturnType<typeof buildUsageReport> | null;
  segments: ReturnType<typeof buildSegments>;
  segmented: { bytes: number; files: number };
  coverage: string | null;
  trashReason?: string;
  root: string;
  scanning: boolean;
  failure: string | null;
  working: boolean;
  largest: ScanResult['files'];
  onRescan: () => void;
  onEmptyTrash: () => void;
  onReveal: (path: string) => void;
  onTrash: (paths: string[]) => void;
}

function Body(props: BodyProps) {
  const { view, result, tree, failure, scanning } = props;
  if (failure && !result) {
    return (
      <EmptyState
        icon={<TriangleAlert />}
        title="This folder could not be scanned"
        description={failure}
        action={
          <Button size="sm" onClick={props.onRescan}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!result) {
    return (
      <EmptyState
        icon={<HardDrive />}
        title={scanning ? 'Scanning…' : 'Nothing measured yet'}
        description={
          scanning
            ? 'Counting the files under your home folder.'
            : 'Run a scan to see what is using space.'
        }
        action={
          scanning ? undefined : (
            <Button size="sm" onClick={props.onRescan}>
              Scan now
            </Button>
          )
        }
      />
    );
  }
  if (view === 'folders' && tree) {
    return <Folders tree={tree} path={props.activePath} onPathChange={props.onPathChange} />;
  }
  if (view === 'files') {
    return (
      <LargestFiles
        files={props.largest}
        root={props.root}
        onReveal={props.onReveal}
        onTrash={props.onTrash}
        busy={props.working}
      />
    );
  }
  return (
    <Overview
      report={props.report}
      segments={props.segments}
      segmented={props.segmented}
      coverage={props.coverage}
      trashReason={props.trashReason}
      root={props.root}
      scannedAt={result.finishedAt}
      partial={!result.complete}
      onEmptyTrash={props.onEmptyTrash}
      emptyTrashEnabled={
        !props.working && (props.segments.find((s) => s.id === 'trash')?.bytes ?? 0) > 0
      }
    />
  );
}

/** What the scan is doing now, or what the last one found. */
function StatusBar({
  scanning,
  progress,
  result,
  failure,
  root,
}: {
  scanning: boolean;
  progress: ScanProgress | null;
  result: ScanResult | null;
  failure: string | null;
  root: string;
}) {
  if (scanning) {
    return (
      <>
        <span className="shrink-0 tabular-nums">
          {progress ? progressLabel(progress) : 'Starting…'}
        </span>
        <ToolbarSpacer />
        <span className="min-w-0 truncate text-ink-3">{progress?.path ?? root}</span>
      </>
    );
  }
  if (!result) {
    return <span className="min-w-0 truncate">{failure ?? 'No scan taken'}</span>;
  }
  return (
    <>
      <span className="shrink-0 tabular-nums">
        {result.files.length.toLocaleString()} files · {formatBytes(result.bytes)}
      </span>
      {result.errors.length > 0 && (
        <span className="shrink-0 tabular-nums text-ink-3">
          {result.errors.length} unreadable {result.errors.length === 1 ? 'folder' : 'folders'}
        </span>
      )}
      {!result.complete && (
        <span className="shrink-0 text-ink-3">
          {result.truncated ? 'Stopped at the file ceiling' : 'Stopped early'} — figures are partial
        </span>
      )}
      <ToolbarSpacer />
      <span className="min-w-0 truncate tabular-nums text-ink-3">
        Scanned {formatRelative(result.finishedAt)}
      </span>
    </>
  );
}
