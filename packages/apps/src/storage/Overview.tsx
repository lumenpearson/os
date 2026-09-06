/**
 * The overview: what the file system reports for itself, what the browser
 * reports for this origin, and what the scanned files add up to by category.
 *
 * The two figures are printed side by side. Where one is missing there is an
 * em-dash and the reason, and where they disagree the disagreement is a line
 * of its own — the app never resolves it by choosing.
 */

import { Button, cx, IconButton, Progress, useElementSize } from '@lumen/ui';
import { formatBytes } from '@lumen/vfs';
import { Trash2 } from 'lucide-react';
import { formatDateTime } from '../_sdk';
import { formatShare, NO_VALUE, type Reading, type Segment, type UsageReport } from './usage';

/** The narrowest list that still holds a label, three figures and a button. */
const NARROW_LIST = 440;

export interface OverviewProps {
  report: UsageReport | null;
  segments: Segment[];
  /** Bytes and files the segments cover. */
  segmented: { bytes: number; files: number };
  /** What the segments do not cover, in one line, or null. */
  coverage: string | null;
  /** Why the Trash could not be measured, if it could not. */
  trashReason?: string;
  root: string;
  scannedAt: number | null;
  partial: boolean;
  onEmptyTrash: () => void;
  emptyTrashEnabled: boolean;
}

export function Overview({
  report,
  segments,
  segmented,
  coverage,
  trashReason,
  root,
  scannedAt,
  partial,
  onEmptyTrash,
  emptyTrashEnabled,
}: OverviewProps) {
  return (
    <div className="lumen-scroll min-h-0 flex-1">
      <div className="mx-auto flex max-w-2xl flex-col gap-7 px-6 py-6">
        <Volume report={report} />
        <Stored
          segments={segments}
          segmented={segmented}
          coverage={coverage}
          trashReason={trashReason}
          root={root}
          scannedAt={scannedAt}
          partial={partial}
          onEmptyTrash={onEmptyTrash}
          emptyTrashEnabled={emptyTrashEnabled}
        />
      </div>
    </div>
  );
}

function Volume({ report }: { report: UsageReport | null }) {
  return (
    <section aria-labelledby="storage-volume" className="flex flex-col gap-2">
      <h2 id="storage-volume" className="px-1 text-md font-medium text-ink">
        This volume
      </h2>
      <div className="rounded-md border border-rule bg-surface">
        {report && report.fraction !== null && (
          <div className="flex flex-col gap-1.5 border-b border-rule px-4 py-3">
            <Progress value={report.fraction} label="Space in use" />
            <p className="mono text-sm tabular-nums text-ink-2">
              {report.used.value} of {report.quota.value} used ({formatShare(report.fraction)})
            </p>
          </div>
        )}
        <dl className="divide-y divide-rule">
          <ReadingRow label="Used" reading={report?.used} />
          <ReadingRow label="Quota" reading={report?.quota} />
          <ReadingRow label="Browser estimate" reading={report?.browser} />
        </dl>
        <div className="flex flex-col gap-1 border-t border-rule px-4 py-2.5">
          {report?.disagreement && <p className="text-sm text-ink">{report.disagreement}</p>}
          <p className="text-sm text-ink-3">{report?.source ?? 'Nothing measured yet.'}</p>
        </div>
      </div>
    </section>
  );
}

/** One figure, with an em-dash and the reason when there is none. */
function ReadingRow({ label, reading }: { label: string; reading: Reading | undefined }) {
  const available = reading?.available ?? false;
  return (
    <div
      data-reading={label}
      data-available={available}
      className="flex flex-wrap items-baseline gap-x-4 px-4 py-2"
    >
      <dt className="w-40 shrink-0 text-base text-ink-2">{label}</dt>
      <dd className="flex min-w-40 flex-1 flex-col gap-0.5">
        <span
          className={cx(
            'mono text-base tabular-nums select-text',
            available ? 'text-ink' : 'text-ink-3',
          )}
        >
          {available ? reading?.value : NO_VALUE}
        </span>
        {!available && reading?.reason && (
          <span className="text-sm text-ink-3">{reading.reason}</span>
        )}
      </dd>
    </div>
  );
}

function Stored({
  segments,
  segmented,
  coverage,
  trashReason,
  root,
  scannedAt,
  partial,
  onEmptyTrash,
  emptyTrashEnabled,
}: Omit<OverviewProps, 'report'>) {
  const total = segmented.bytes;
  const [listRef, list] = useElementSize<HTMLDivElement>();
  // Below this the three figures, the label and the Trash button cannot share
  // a row: the share goes first (the bar above already shows it), then the
  // button keeps its icon and gives up its words.
  const narrow = list.width > 0 && list.width < NARROW_LIST;
  return (
    <section aria-labelledby="storage-stored" className="flex flex-col gap-2">
      <h2 id="storage-stored" className="px-1 text-md font-medium text-ink">
        What is stored
      </h2>
      <div ref={listRef} className="rounded-md border border-rule bg-surface">
        <div className="flex flex-col gap-2 border-b border-rule px-4 py-3">
          <div
            aria-hidden
            className="flex h-3 w-full overflow-hidden rounded-sm border border-rule bg-surface-2"
          >
            {segments.map((segment) => (
              <div
                key={segment.id}
                style={{ width: `${segment.share * 100}%`, background: segment.color }}
              />
            ))}
          </div>
          <p className="mono text-sm tabular-nums text-ink-2">
            {formatBytes(total)} in {segmented.files.toLocaleString()} files under {root} and the
            Trash
            {partial ? ' (partial scan)' : ''}
          </p>
        </div>
        <ul className="divide-y divide-rule">
          {segments.map((segment) => (
            <li
              key={segment.id}
              data-segment={segment.id}
              className="flex items-center gap-3 px-4 py-2"
            >
              <span
                aria-hidden
                className="size-2.5 shrink-0 rounded-xs"
                style={{ background: segment.color }}
              />
              <span className="min-w-0 flex-1 truncate-1 text-base text-ink">{segment.label}</span>
              {segment.id === 'trash' &&
                (narrow ? (
                  <IconButton
                    size="sm"
                    label="Empty Trash"
                    onClick={onEmptyTrash}
                    disabled={!emptyTrashEnabled}
                  >
                    <Trash2 className="size-3.5" />
                  </IconButton>
                ) : (
                  <Button
                    size="sm"
                    icon={<Trash2 className="size-3.5" />}
                    onClick={onEmptyTrash}
                    disabled={!emptyTrashEnabled}
                  >
                    Empty Trash
                  </Button>
                ))}
              <span className="mono w-24 shrink-0 text-right text-sm tabular-nums text-ink-3">
                {segment.files.toLocaleString()} {segment.files === 1 ? 'file' : 'files'}
              </span>
              <span className="mono w-20 shrink-0 text-right text-sm tabular-nums text-ink">
                {formatBytes(segment.bytes)}
              </span>
              {!narrow && (
                <span className="mono w-14 shrink-0 text-right text-sm tabular-nums text-ink-3">
                  {formatShare(segment.share)}
                </span>
              )}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1 border-t border-rule px-4 py-2.5">
          {trashReason && (
            <p className="text-sm text-ink-3">The Trash could not be measured: {trashReason}</p>
          )}
          {coverage && <p className="text-sm text-ink-3">{coverage}</p>}
          <p className="text-sm text-ink-3">
            {scannedAt === null ? 'No scan taken yet.' : `Scanned ${formatDateTime(scannedAt)}.`}
          </p>
        </div>
      </div>
    </section>
  );
}
