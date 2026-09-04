/**
 * What this computer reports about itself, and what it will not report.
 *
 * One reading is taken when the window opens (it takes about half a second,
 * because the refresh rate is measured rather than looked up) and again on
 * demand. The uptime section ticks off the kernel's boot time; nothing else
 * moves until the next reading is taken.
 */

import { useSessionStore } from '@lumen/kernel';
import { useClipboard, useClock, useKernel, usePlatform, useVfs } from '@lumen/kernel/react';
import {
  AppFrame,
  Button,
  EmptyState,
  IconButton,
  Spinner,
  Toolbar,
  ToolbarSpacer,
  useLatest,
} from '@lumen/ui';
import { join } from '@lumen/vfs';
import { ClipboardCopy, RotateCw, Save, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  type AppProps,
  formatDateTime,
  formatTime,
  useAppMenus,
  useLauncher,
  useNotify,
  useTitle,
  useWindowControls,
} from '../_sdk';
import { collectSnapshot, SAMPLE_MS } from './collect';
import { buildSysInfoMenus } from './menus';
import { Overview } from './Overview';
import { renderReport, reportFileName } from './report';
import { Section } from './Section';
import { StorageBar } from './StorageBar';
import {
  buildSections,
  type LiveValues,
  type Section as SectionModel,
  type Snapshot,
} from './sections';
import { countReadings, reportTitle, splitOverview } from './view';

/**
 * Animation frames stop arriving in a hidden window, so the frame sample gets
 * a deadline. Aborting it ends the measurement and the row says it could not
 * be taken; the rest of the reading carries on.
 */
const SAMPLE_DEADLINE_MS = SAMPLE_MS + 1500;

export default function SystemInfo(_props: AppProps) {
  const platform = usePlatform();
  const vfs = useVfs();
  const kernel = useKernel();
  const notify = useNotify();
  const { open } = useLauncher();
  const { copyText } = useClipboard();
  const { close } = useWindowControls();
  const bootedAt = useSessionStore((s) => s.bootedAt);
  useTitle('System Information');

  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [reading, setReading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  // `attempt` is never read in the body: bumping it is the request for a new
  // reading, and it is the only thing that may run this effect a second time.
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the trigger
  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    const deadline = setTimeout(() => controller.abort(), SAMPLE_DEADLINE_MS);
    setReading(true);
    collectSnapshot({ platform, vfs, bootedAt, signal: controller.signal })
      .then((next) => {
        if (!alive) return;
        setSnapshot(next);
        setFailure(null);
      })
      .catch((error: unknown) => {
        if (alive) setFailure(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (alive) setReading(false);
      });
    return () => {
      alive = false;
      clearTimeout(deadline);
      controller.abort();
    };
  }, [platform, vfs, bootedAt, attempt]);

  const now = useClock(1000);
  const live = useMemo<LiveValues>(
    () => ({ now: now.getTime(), startedAtLabel: formatDateTime(bootedAt) }),
    [now, bootedAt],
  );
  const sections = useMemo(() => (snapshot ? buildSections(snapshot, live) : []), [snapshot, live]);
  const { overview, rest } = useMemo(() => splitOverview(sections), [sections]);
  const counts = useMemo(() => countReadings(sections), [sections]);

  // The sheet is rebuilt every second so the uptime ticks. The commands read
  // the latest one through a ref, which keeps them — and the menubar they are
  // bound into — stable between ticks.
  const latest = useLatest({ sections, overview, snapshot, counts });

  const report = useCallback((): { text: string; collectedAt: number } | null => {
    const { sections: rows, overview: hero, snapshot: taken } = latest.current;
    if (!taken || rows.length === 0) return null;
    return {
      text: renderReport(rows, {
        title: reportTitle(hero),
        collectedAtLabel: formatDateTime(taken.collectedAt),
      }),
      collectedAt: taken.collectedAt,
    };
  }, [latest]);

  const copyReport = useCallback(() => {
    const made = report();
    if (!made) return;
    copyText(made.text);
    const { total, missing } = latest.current.counts;
    notify(
      'Report copied',
      missing === 0 ? `${total} values.` : `${total} values, ${missing} unavailable.`,
    );
  }, [report, copyText, notify, latest]);

  const saveReport = useCallback(async () => {
    const made = report();
    if (!made) return;
    const dir = join(kernel.home, 'Documents');
    try {
      await vfs.ensureDir(dir);
      const path = await vfs.createFile(dir, reportFileName(made.collectedAt), made.text);
      notify('Report saved', path, {
        actions: [{ id: 'open', label: 'Open' }],
        onAction: (id) => {
          if (id === 'open') void open(path);
        },
      });
    } catch (error) {
      notify('Could not save the report', error instanceof Error ? error.message : String(error));
    }
  }, [report, kernel, vfs, notify, open]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  const ready = snapshot !== null;
  const hasReport = ready && !reading;

  useAppMenus(
    buildSysInfoMenus(
      { ready, reading },
      { copyReport, saveReport: () => void saveReport(), refresh, close },
    ),
    [ready, reading, copyReport, saveReport, refresh, close],
  );

  return (
    <AppFrame
      toolbar={
        <Toolbar dense>
          <IconButton label="Take readings again" onClick={refresh} disabled={reading}>
            <RotateCw />
          </IconButton>
          <ToolbarSpacer />
          <Button
            size="sm"
            icon={<ClipboardCopy className="size-3.5" />}
            onClick={copyReport}
            disabled={!hasReport}
          >
            Copy Report
          </Button>
          <Button
            size="sm"
            icon={<Save className="size-3.5" />}
            onClick={() => void saveReport()}
            disabled={!hasReport}
          >
            Save Report
          </Button>
        </Toolbar>
      }
      statusBar={
        <StatusBar
          reading={reading}
          total={counts.total}
          missing={counts.missing}
          at={snapshot?.collectedAt}
          failure={failure}
        />
      }
    >
      <Readings
        snapshot={snapshot}
        overview={overview}
        rest={rest}
        failure={failure}
        onRetry={refresh}
      />
    </AppFrame>
  );
}

function StatusBar({
  reading,
  total,
  missing,
  at,
}: {
  reading: boolean;
  total: number;
  missing: number;
  at: number | undefined;
}) {
  if (total === 0) return <span>{reading ? 'Taking readings…' : 'No readings'}</span>;
  return (
    <>
      <span className="tabular-nums">{total} values</span>
      <span className="tabular-nums text-ink-3">{missing} unavailable here</span>
      <ToolbarSpacer />
      <span className="tabular-nums text-ink-3">
        {reading || at === undefined
          ? 'Taking readings…'
          : `Read ${formatTime(at, { seconds: true })}`}
      </span>
    </>
  );
}

function Readings({
  snapshot,
  overview,
  rest,
  failure,
  onRetry,
}: {
  snapshot: Snapshot | null;
  overview: SectionModel | null;
  rest: SectionModel[];
  failure: string | null;
  onRetry: () => void;
}) {
  if (failure && !snapshot) {
    return (
      <EmptyState
        icon={<TriangleAlert />}
        title="This machine could not be read"
        description={failure}
        action={
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }
  if (!snapshot) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner size={20} />
      </div>
    );
  }
  return (
    <div className="lumen-scroll flex-1">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-6">
        {overview && <Overview section={overview} />}
        {rest.map((section) => (
          <Section
            key={section.id}
            section={section}
            header={
              section.id === 'storage' ? <StorageBar reading={snapshot.storage} /> : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}
