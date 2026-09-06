import { Button, cx, IconButton } from '@lumen/ui';
import { CircleStop, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import {
  type InstallJob,
  type InstallRow,
  progressLabel,
  progressRatio,
  rowStatus,
} from './installer';
import type { JobListener } from './useInstalls';

const RUNNING: ReadonlyArray<InstallRow['phase']> = ['downloading', 'verifying', 'installing'];

/**
 * One package being installed.
 *
 * The phase and the message come from React state, which changes a handful of
 * times per install. The byte count changes with every chunk that arrives, so
 * it is not state at all: the row subscribes to the runner and writes the bar
 * and the figure straight to the DOM inside a frame.
 */
function ProgressRow({
  jobId,
  row,
  subscribe,
}: {
  jobId: string;
  row: InstallRow;
  subscribe: (listener: JobListener) => () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const figure = useRef<HTMLSpanElement>(null);
  const pending = useRef<InstallRow | null>(null);
  const frame = useRef(0);
  const rowId = row.id;

  useEffect(() => {
    const write = () => {
      frame.current = 0;
      const next = pending.current;
      if (next === null) return;
      const ratio = progressRatio(next);
      const percent = ratio === null ? 0 : Math.round(ratio * 100);
      if (fill.current) fill.current.style.width = `${percent}%`;
      if (track.current) track.current.setAttribute('aria-valuenow', String(percent));
      if (figure.current) figure.current.textContent = progressLabel(next);
    };
    const unsubscribe = subscribe((job) => {
      if (job.id !== jobId) return;
      const next = job.rows.find((r) => r.id === rowId);
      if (next === undefined) return;
      pending.current = next;
      if (frame.current === 0) frame.current = requestAnimationFrame(write);
    });
    return () => {
      unsubscribe();
      if (frame.current !== 0) cancelAnimationFrame(frame.current);
    };
  }, [subscribe, jobId, rowId]);

  const ratio = progressRatio(row);
  const failed = row.phase === 'failed';
  return (
    <li className="flex flex-col gap-1 py-1.5">
      <div className="flex items-baseline gap-3">
        <span className="truncate-1 text-base text-ink">{row.name}</span>
        <span
          className={cx('ms-auto truncate-1 text-sm', failed ? 'text-danger' : 'text-ink-2')}
          aria-live={failed ? 'polite' : undefined}
        >
          {rowStatus(row)}
        </span>
      </div>
      {RUNNING.includes(row.phase) && (
        <div className="flex items-center gap-2">
          <div
            ref={track}
            role="progressbar"
            aria-label={`Downloading ${row.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ratio === null ? 0 : Math.round(ratio * 100)}
            // A progress bar's ends are round because the bar is that shape,
            // not because a radius scale was applied to a box.
            // deslop-ignore-next-line 19
            className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-surface-3"
          >
            <div
              ref={fill}
              // deslop-ignore-next-line 19
              className="h-full rounded-full bg-accent transition-[width] duration-(--duration-fast) ease-(--ease-standard)"
              style={{ width: `${ratio === null ? 0 : Math.round(ratio * 100)}%` }}
            />
          </div>
          <span ref={figure} className="mono shrink-0 text-2xs text-ink-3 tabular-nums">
            {progressLabel(row)}
          </span>
        </div>
      )}
    </li>
  );
}

/**
 * Whether the job's own sentence is the one its single row is already
 * showing. A one-package install ends with the job and the row saying the
 * same words, one under the other; a failure that never reached a row, or a
 * bundle whose outcome is about the set, says something the rows cannot.
 */
function echoesItsOnlyRow(job: InstallJob): boolean {
  if (job.rows.length !== 1) return false;
  const only = job.rows[0];
  return only !== undefined && job.message === rowStatus(only);
}

export interface InstallJobsProps {
  jobs: readonly InstallJob[];
  subscribe: (listener: JobListener) => () => void;
  onStop: (id: string) => void;
  onDismiss: (id: string) => void;
}

/** Every install this session that has not been dismissed, one block each. */
export function InstallJobs({ jobs, subscribe, onStop, onDismiss }: InstallJobsProps) {
  if (jobs.length === 0) return null;
  return (
    <div className="lumen-scroll max-h-56 shrink-0 border-b border-rule bg-canvas px-4 py-2">
      <ul className="flex flex-col gap-3" aria-label="Installs">
        {jobs.map((job) => (
          <li key={job.id} className="flex flex-col gap-1">
            <div className="flex items-baseline gap-2">
              <h3 className="truncate-1 text-base font-medium text-ink">{job.name}</h3>
              {job.bundle && (
                <span className="mono shrink-0 text-2xs text-ink-3 tabular-nums">
                  {job.rows.length} packages
                </span>
              )}
              <span className="ms-auto flex shrink-0 items-center gap-1">
                {job.state === 'running' ? (
                  <IconButton
                    size="sm"
                    label={`Stop installing ${job.name}`}
                    onClick={() => onStop(job.id)}
                  >
                    <CircleStop />
                  </IconButton>
                ) : (
                  <IconButton
                    size="sm"
                    label={`Dismiss ${job.name}`}
                    onClick={() => onDismiss(job.id)}
                  >
                    <X />
                  </IconButton>
                )}
              </span>
            </div>
            <ul className="flex flex-col divide-y divide-rule border-y border-rule">
              {job.rows.map((row) => (
                <ProgressRow key={row.id} jobId={job.id} row={row} subscribe={subscribe} />
              ))}
            </ul>
            {job.message !== null && !echoesItsOnlyRow(job) && (
              <p className={cx('text-sm', job.state === 'failed' ? 'text-danger' : 'text-ink-2')}>
                {job.message}
              </p>
            )}
            {job.state === 'failed' && job.rows.length === 0 && (
              <Button size="sm" className="self-start" onClick={() => onDismiss(job.id)}>
                Dismiss
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
